import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { TestQueryProvider } from "@app/tests/utils/TestQueryProvider";
import {
  useEndpointEnabled,
  useMultipleEndpointsEnabled,
} from "@app/hooks/useEndpointConfig";
import apiClient from "@app/services/apiClient";

/**
 * Characterisation tests for the desktop endpoint-availability hooks. They
 * assert observable behaviour through the shared apiClient + services boundary,
 * so the same contract holds before and after the TanStack Query conversion:
 * the optimistic-enabled default, the loading hold while the backend is not
 * ready, SaaS-mode optimism, the fail-closed-locally fallback, the legacy 400
 * retry, and the self-hosted-offline local check.
 */

// Stable t: the real useTranslation returns a stable reference, and the hook
// deps its fetch callbacks on it — a fresh t each render would loop forever.
const t = (_k: string, fallback?: string) => fallback;
const translation = { t };
vi.mock("react-i18next", () => ({
  useTranslation: () => translation,
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
vi.mock("@app/i18n", () => ({
  default: { t: (_k: string, fallback?: string) => fallback ?? _k },
}));

// --- apiClient: one get() that dispatches on URL ---
vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn() },
}));
const mockGet = vi.mocked(apiClient.get);

// --- connection mode ---
let mode: "saas" | "selfhosted" | "local" = "saas";
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: () => Promise.resolve(mode),
    getCurrentConfig: () =>
      Promise.resolve({
        mode,
        server_config: null,
        lock_connection_mode: false,
      }),
  },
}));

// --- tauri backend: a mutable status + change listeners (no replay on subscribe) ---
let backendStatus: "stopped" | "starting" | "healthy" | "unhealthy" = "healthy";
let backendUrl: string | null = "http://127.0.0.1:8080";
const backendListeners = new Set<(s: string) => void>();
vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: {
    get isOnline() {
      return backendStatus === "healthy";
    },
    getBackendUrl: () => backendUrl,
    subscribeToStatus: (listener: (s: string) => void) => {
      backendListeners.add(listener);
      return () => backendListeners.delete(listener);
    },
  },
}));
function setBackendStatus(next: typeof backendStatus) {
  backendStatus = next;
  act(() => backendListeners.forEach((l) => l(next)));
}

// --- self-hosted monitor: replays state on subscribe, matching the real one ---
let selfHostedStatus: "idle" | "checking" | "online" | "offline" = "online";
const selfHostedListeners = new Set<(s: { status: string }) => void>();
vi.mock("@app/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: {
    getSnapshot: () => ({
      status: selfHostedStatus,
      isOnline: selfHostedStatus === "online",
      serverUrl: null,
    }),
    subscribe: (listener: (s: { status: string }) => void) => {
      selfHostedListeners.add(listener);
      listener({ status: selfHostedStatus });
      return () => selfHostedListeners.delete(listener);
    },
  },
}));
function setSelfHostedStatus(next: typeof selfHostedStatus) {
  selfHostedStatus = next;
  act(() =>
    selfHostedListeners.forEach((l) => l({ status: selfHostedStatus })),
  );
}

// --- local-support probe used only on the self-hosted-offline path ---
const mockLocalSupport = vi.fn();
vi.mock("@app/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: {
    isEndpointSupportedLocally: (endpoint: string, url: string | null) =>
      mockLocalSupport(endpoint, url),
  },
}));

const NONE: string[] = [];

function appConfig(dependenciesReady: boolean) {
  return { data: { dependenciesReady } };
}
function availability(map: Record<string, { enabled: boolean }>) {
  return { data: map };
}

beforeEach(() => {
  vi.clearAllMocks();
  mode = "saas";
  backendStatus = "healthy";
  backendUrl = "http://127.0.0.1:8080";
  selfHostedStatus = "online";
  backendListeners.clear();
  selfHostedListeners.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("desktop useMultipleEndpointsEnabled", () => {
  it("projects a fetched availability map once dependencies are ready", async () => {
    mode = "local";
    mockGet.mockImplementation((url: string) => {
      if (url.includes("app-config")) return Promise.resolve(appConfig(true));
      return Promise.resolve(
        availability({ merge: { enabled: true }, ocr: { enabled: false } }),
      );
    });

    const { result } = renderHook(
      () => useMultipleEndpointsEnabled(["merge", "ocr"]),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.endpointStatus).toEqual({ merge: true, ocr: false });
  });

  it("marks locally-disabled endpoints available in SaaS mode", async () => {
    mode = "saas";
    mockGet.mockImplementation((url: string) => {
      if (url.includes("app-config")) return Promise.resolve(appConfig(true));
      return Promise.resolve(availability({ ocr: { enabled: false } }));
    });

    const { result } = renderHook(() => useMultipleEndpointsEnabled(["ocr"]), {
      wrapper: TestQueryProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // SaaS routing covers it even though the local backend disabled it.
    expect(result.current.endpointStatus.ocr).toBe(true);
  });

  it("fails closed for un-fetchable endpoints outside SaaS mode", async () => {
    mode = "local";
    mockGet.mockImplementation((url: string) => {
      if (url.includes("app-config")) return Promise.resolve(appConfig(true));
      return Promise.reject(new Error("network"));
    });

    const { result } = renderHook(
      () => useMultipleEndpointsEnabled(["merge"]),
      {
        wrapper: TestQueryProvider,
      },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.endpointStatus.merge).toBe(false);
  });

  it("retries the legacy query-param form when the server rejects the bare call", async () => {
    mode = "local";
    let sawLegacy = false;
    mockGet.mockImplementation((url: string) => {
      if (url.includes("app-config")) return Promise.resolve(appConfig(true));
      if (url.includes("endpoints=")) {
        sawLegacy = true;
        return Promise.resolve(availability({ merge: { enabled: true } }));
      }
      return Promise.reject({
        isAxiosError: true,
        response: { status: 400 },
      });
    });

    const { result } = renderHook(
      () => useMultipleEndpointsEnabled(["merge"]),
      {
        wrapper: TestQueryProvider,
      },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sawLegacy).toBe(true);
    expect(result.current.endpointStatus.merge).toBe(true);
  });

  it("checks the local backend directly when the self-hosted server is offline", async () => {
    mode = "selfhosted";
    selfHostedStatus = "offline";
    mockLocalSupport.mockImplementation((endpoint: string) =>
      Promise.resolve(endpoint === "merge"),
    );

    const { result } = renderHook(
      () => useMultipleEndpointsEnabled(["merge", "ocr"]),
      { wrapper: TestQueryProvider },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.endpointStatus).toEqual({ merge: true, ocr: false });
    // The remote availability endpoint is never called on this path.
    expect(mockGet).not.toHaveBeenCalledWith(
      expect.stringContaining("endpoints-availability"),
      expect.anything(),
    );
  });

  it("holds loading while the backend is not online, without fetching", async () => {
    backendStatus = "starting";
    selfHostedStatus = "online"; // not the offline branch
    mockGet.mockImplementation((url: string) => {
      if (url.includes("app-config")) return Promise.resolve(appConfig(true));
      return Promise.resolve(availability({ merge: { enabled: true } }));
    });

    const { result } = renderHook(
      () => useMultipleEndpointsEnabled(["merge"]),
      {
        wrapper: TestQueryProvider,
      },
    );

    // useQuickNavToolReasons gates a memo on this: it must stay true (not flip
    // to an empty answer) until a real result lands.
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.loading).toBe(true);
    expect(mockGet).not.toHaveBeenCalledWith(
      expect.stringContaining("endpoints-availability"),
      expect.anything(),
    );
  });

  it("fetches once the backend reports healthy", async () => {
    backendStatus = "starting";
    mockGet.mockImplementation((url: string) => {
      if (url.includes("app-config")) return Promise.resolve(appConfig(true));
      return Promise.resolve(availability({ merge: { enabled: true } }));
    });

    const { result } = renderHook(
      () => useMultipleEndpointsEnabled(["merge"]),
      {
        wrapper: TestQueryProvider,
      },
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.loading).toBe(true);

    setBackendStatus("healthy");

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.endpointStatus.merge).toBe(true);
  });

  it("swaps local-check results for remote availability when the server returns", async () => {
    mode = "selfhosted";
    selfHostedStatus = "offline";
    mockLocalSupport.mockResolvedValue(false); // offline: nothing supported locally
    mockGet.mockImplementation((url: string) => {
      if (url.includes("app-config")) return Promise.resolve(appConfig(true));
      return Promise.resolve(availability({ merge: { enabled: true } }));
    });

    const { result } = renderHook(() => useMultipleEndpointsEnabled(["merge"]), {
      wrapper: TestQueryProvider,
    });
    await waitFor(() => expect(result.current.endpointStatus.merge).toBe(false));

    // Server comes back: the hook must re-resolve against the remote, not sit
    // on the stale offline answer.
    setSelfHostedStatus("online");
    await waitFor(() => expect(result.current.endpointStatus.merge).toBe(true));
  });

  it("reports nothing loading when asked for no endpoints", async () => {
    // Stable reference: the current hook keys effects on the array identity.
    const { result } = renderHook(() => useMultipleEndpointsEnabled(NONE), {
      wrapper: TestQueryProvider,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.endpointStatus).toEqual({});
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe("desktop useEndpointEnabled", () => {
  it("starts optimistically enabled before any answer", () => {
    mode = "local";
    mockGet.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useEndpointEnabled("merge"), {
      wrapper: TestQueryProvider,
    });
    // Tools must not flash disabled while the backend boots.
    expect(result.current.enabled).toBe(true);
  });

  it("reflects a locally-enabled endpoint", async () => {
    mode = "local";
    mockGet.mockImplementation((url: string) => {
      if (url.includes("app-config")) return Promise.resolve(appConfig(true));
      return Promise.resolve({ data: true });
    });
    const { result } = renderHook(() => useEndpointEnabled("merge"), {
      wrapper: TestQueryProvider,
    });
    await waitFor(() => expect(result.current.enabled).toBe(true));
  });

  it("disables a locally-disabled endpoint outside SaaS mode", async () => {
    mode = "local";
    mockGet.mockImplementation((url: string) => {
      if (url.includes("app-config")) return Promise.resolve(appConfig(true));
      return Promise.resolve({ data: false });
    });
    const { result } = renderHook(() => useEndpointEnabled("merge"), {
      wrapper: TestQueryProvider,
    });
    await waitFor(() => expect(result.current.enabled).toBe(false));
  });

  it("keeps a locally-disabled endpoint enabled in SaaS mode", async () => {
    mode = "saas";
    mockGet.mockImplementation((url: string) => {
      if (url.includes("app-config")) return Promise.resolve(appConfig(true));
      return Promise.resolve({ data: false });
    });
    const { result } = renderHook(() => useEndpointEnabled("merge"), {
      wrapper: TestQueryProvider,
    });
    // Stays enabled: it will route to the SaaS backend.
    await new Promise((r) => setTimeout(r, 0));
    await waitFor(() => expect(result.current.enabled).toBe(true));
  });
});
