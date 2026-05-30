import type { AxiosInstance } from "axios";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { OPEN_SIGN_IN_EVENT } from "@app/constants/signInEvents";

// All transitive imports of apiClientSetup are mocked - the test exercises the
// error-interceptor logic in isolation by hand-rolling a minimal axios-like
// client and capturing the registered handlers.

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

import { setupApiInterceptors } from "@app/services/apiClientSetup";

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
    // setupApiInterceptors calls client.request(originalRequest) on successful
    // refresh-retry. That branch is not exercised by these tests, but the
    // method must exist on the mock.
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
  await Promise.resolve(handler(error)).catch(() => {
    // The interceptor re-rejects after handling; that's expected.
  });
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

  test("PUT 401 without Authorization dispatches sign-in modal event", async () => {
    const { client, handlers } = makeMockClient();
    setupApiInterceptors(client as unknown as AxiosInstance);
    await triggerErrorInterceptor(handlers, {
      response: { status: 401 },
      config: { method: "put", url: "/api/v1/files/123", headers: {} },
    });
    expect(events).toHaveLength(1);
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
