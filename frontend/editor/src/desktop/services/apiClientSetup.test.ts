import type { AxiosInstance } from "axios";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { OPEN_SIGN_IN_EVENT } from "@app/constants/signInEvents";
import { expectConsole } from "@app/tests/failOnConsole";

// Exercise the error-interceptor logic against a hand-rolled axios-like
// client; transitive imports are mocked out so this is a pure unit test.

const { getAccessTokenMock } = vi.hoisted(() => ({
  getAccessTokenMock: vi.fn(),
}));

vi.mock("@app/auth/session", () => ({ getAccessToken: getAccessTokenMock }));
vi.mock("@app/components/toast", () => ({ alert: vi.fn() }));
vi.mock("@core/services/apiClientSetup", () => ({
  setupApiInterceptors: vi.fn(),
  getAuthHeaders: vi.fn(),
}));
vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: {
    isOnline: true,
    getBackendStatus: () => "healthy",
    getBackendPort: () => 8080,
  },
}));
vi.mock("@app/constants/backendErrors", () => ({
  createBackendNotReadyError: () => new Error("backend not ready"),
}));
vi.mock("@app/services/operationRouter", () => ({
  operationRouter: {
    isSelfHostedMode: vi.fn().mockResolvedValue(true),
    isSaaSMode: vi.fn().mockResolvedValue(false),
    getBaseUrl: vi.fn().mockResolvedValue("https://example.test"),
    shouldSkipBackendReadyCheck: vi.fn().mockResolvedValue(false),
  },
}));
vi.mock("@app/services/authService", () => ({
  authService: {
    awaitRefreshIfInProgress: vi.fn().mockResolvedValue(undefined),
    getAuthToken: vi.fn().mockResolvedValue(null),
    refreshToken: vi.fn().mockResolvedValue(false),
    refreshSupabaseToken: vi.fn().mockResolvedValue(false),
  },
}));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getServerConfig: vi.fn().mockResolvedValue({ url: "https://example.test" }),
  },
}));
vi.mock("@app/constants/connection", () => ({
  STIRLING_SAAS_URL: "https://saas.test",
  STIRLING_SAAS_BACKEND_API_URL: "https://api.saas.test",
}));
vi.mock("@app/i18n", () => ({
  default: { t: (_key: string, fallback: string) => fallback || _key },
}));

import {
  setupApiInterceptors,
  getAuthHeaders,
} from "@app/services/apiClientSetup";
import { operationRouter } from "@app/services/operationRouter";

type Interceptor = (value: unknown) => unknown;

type Handlers = {
  request: Interceptor[];
  responseFulfilled: Interceptor[];
  responseRejected: Interceptor[];
};

type MockClient = {
  interceptors: {
    request: { use: (onFulfilled: Interceptor) => void };
    response: {
      use: (onFulfilled: Interceptor, onRejected: Interceptor) => void;
    };
  };
  request: ReturnType<typeof vi.fn>;
};

function makeMockClient(): { client: MockClient; handlers: Handlers } {
  const handlers: Handlers = {
    request: [],
    responseFulfilled: [],
    responseRejected: [],
  };
  const client: MockClient = {
    interceptors: {
      request: {
        use: (onFulfilled) => {
          handlers.request.push(onFulfilled);
        },
      },
      response: {
        use: (onFulfilled, onRejected) => {
          handlers.responseFulfilled.push(onFulfilled);
          handlers.responseRejected.push(onRejected);
        },
      },
    },
    // Must exist on the mock; not exercised by these tests.
    request: vi.fn(),
  };
  return { client, handlers };
}

async function triggerErrorInterceptor(
  handlers: Handlers,
  error: unknown,
): Promise<void> {
  const handler = handlers.responseRejected[0];
  expect(handler).toBeTypeOf("function");
  // The interceptor re-rejects after handling; swallow it.
  await Promise.resolve(handler(error)).catch(() => {});
}

describe("desktop apiClientSetup - 401 silent-path", () => {
  let events: Event[];
  let listener: (e: Event) => void;

  beforeEach(() => {
    events = [];
    listener = (e: Event) => events.push(e);
    window.addEventListener(OPEN_SIGN_IN_EVENT, listener);
  });

  afterEach(() => {
    window.removeEventListener(OPEN_SIGN_IN_EVENT, listener);
  });

  test("POST 401 without Authorization dispatches sign-in modal event", async () => {
    expectConsole.warn(/\[apiClientSetup\] 401 on path/);
    const { client, handlers } = makeMockClient();
    setupApiInterceptors(client as unknown as AxiosInstance);
    await triggerErrorInterceptor(handlers, {
      response: { status: 401 },
      config: {
        method: "post",
        url: "/api/v1/general/merge-pdfs",
        headers: {},
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(OPEN_SIGN_IN_EVENT);
  });

  test("GET 401 without Authorization stays silent (background probe)", async () => {
    expectConsole.warn(/\[apiClientSetup\] 401 on path/);
    const { client, handlers } = makeMockClient();
    setupApiInterceptors(client as unknown as AxiosInstance);
    await triggerErrorInterceptor(handlers, {
      response: { status: 401 },
      config: {
        method: "get",
        url: "/api/v1/config/endpoint-enabled",
        headers: {},
      },
    });
    expect(events).toHaveLength(0);
  });

  test("401 on auth probe (/api/v1/auth/me) never dispatches the modal", async () => {
    const { client, handlers } = makeMockClient();
    setupApiInterceptors(client as unknown as AxiosInstance);
    await triggerErrorInterceptor(handlers, {
      response: { status: 401 },
      config: { method: "get", url: "/api/v1/auth/me", headers: {} },
    });
    expect(events).toHaveLength(0);
  });

  test("401 with skipAuthRedirect set never dispatches the modal", async () => {
    expectConsole.warn(/\[apiClientSetup\] 401 on path/);
    const { client, handlers } = makeMockClient();
    setupApiInterceptors(client as unknown as AxiosInstance);
    await triggerErrorInterceptor(handlers, {
      response: { status: 401 },
      config: {
        method: "post",
        url: "/api/v1/general/merge-pdfs",
        headers: {},
        skipAuthRedirect: true,
      },
    });
    expect(events).toHaveLength(0);
  });
});

describe("desktop request interceptor - auth for SaaS-backend requests", () => {
  type ReqConfig = {
    url: string;
    method: string;
    headers: Record<string, string>;
  };

  async function runRequestInterceptor(config: ReqConfig): Promise<ReqConfig> {
    const { client, handlers } = makeMockClient();
    setupApiInterceptors(client as unknown as AxiosInstance);
    const handler = handlers.request[0];
    expect(handler).toBeTypeOf("function");
    return (await handler(config)) as ReqConfig;
  }

  beforeEach(() => {
    getAccessTokenMock.mockReset();
    // SaaS mode (not self-hosted), local-first routing for tool paths.
    vi.mocked(operationRouter.isSelfHostedMode).mockResolvedValue(false);
    vi.mocked(operationRouter.isSaaSMode).mockResolvedValue(true);
    vi.mocked(operationRouter.getBaseUrl).mockResolvedValue(
      "http://localhost:8080",
    );
    vi.mocked(operationRouter.shouldSkipBackendReadyCheck).mockResolvedValue(
      true,
    );
  });

  test("attaches the Bearer token to an absolute SaaS-backend URL (AI file download)", async () => {
    getAccessTokenMock.mockResolvedValue("jwt-123");
    const result = await runRequestInterceptor({
      url: "https://api.saas.test/api/v1/general/files/abc",
      method: "get",
      headers: {},
    });
    expect(result.headers.Authorization).toBe("Bearer jwt-123");
  });

  test("does NOT attach a token to a relative, local-routed tool request", async () => {
    getAccessTokenMock.mockResolvedValue("jwt-123");
    const result = await runRequestInterceptor({
      url: "/api/v1/general/merge-pdfs",
      method: "get",
      headers: {},
    });
    expect(result.headers.Authorization).toBeUndefined();
  });
});

describe("desktop getAuthHeaders (raw fetch / AI SSE stream)", () => {
  beforeEach(() => getAccessTokenMock.mockReset());

  test("attaches the Tauri-store JWT as a Bearer header", async () => {
    getAccessTokenMock.mockResolvedValue("jwt-123");
    expect(await getAuthHeaders()).toEqual({ Authorization: "Bearer jwt-123" });
  });

  test("returns no header when there is no token", async () => {
    getAccessTokenMock.mockResolvedValue(null);
    expect(await getAuthHeaders()).toEqual({});
  });
});
