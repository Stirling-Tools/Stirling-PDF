import { TestQueryProvider } from "@editor/tests/utils/TestQueryProvider";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { fetch } from "@tauri-apps/plugin-http";
import apiClient from "@editor/services/apiClient";
import {
  fetchNotifications,
  reportNotificationResolved,
} from "@editor/services/notifications";
import { fetchSigningSessions } from "@editor/api/signing";
import {
  fetchMountedFiles,
  fetchProcessingFolderRuns,
} from "@editor/services/processingFolderApi";
import { alert } from "@editor/components/toast";
import { operationRouter } from "@editor/services/operationRouter";
import { allowConsole } from "@editor/tests/failOnConsole";
import { useWallet } from "@editor/hooks/useWallet";
import { connectionModeService } from "@editor/services/connectionModeService";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("@editor/components/toast", () => ({ alert: vi.fn() }));
vi.mock("@editor/services/apiClientConfig", () => ({
  getApiBaseUrl: () => "",
}));
vi.mock("@editor/services/tauriLocalProxy", () => ({
  shouldUseFastLocalTransport: () => false,
}));
vi.mock("@editor/services/localFolderContents", () => ({
  readDiskFile: vi.fn(),
}));
vi.mock("@editor/services/billing", () => ({ createPortalSession: vi.fn() }));
vi.mock("@editor/platform/openExternal", () => ({ openExternal: vi.fn() }));
vi.mock("@editor/hooks/walletDevPreview", () => ({
  getWalletDevPreview: () => null,
}));
vi.mock("@editor/auth/session", () => ({
  getAccessToken: async () => "test-token",
}));
vi.mock("@editor/services/authService", () => ({
  authService: {
    awaitRefreshIfInProgress: async () => {},
  },
}));
vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentConfig: async () => ({ local_processing_only: false }),
    getCurrentMode: vi.fn(),
    subscribeToModeChanges: vi.fn(() => () => {}),
  },
}));
vi.mock("@editor/services/tauriBackendService", () => ({
  tauriBackendService: {
    isOnline: true,
    getBackendStatus: () => "healthy",
    getBackendPort: () => 8080,
  },
}));
vi.mock("@editor/services/operationRouter", () => ({
  operationRouter: {
    isSelfHostedMode: async () => false,
    isSaaSMode: async () => true,
    getBaseUrl: vi.fn(),
    shouldSkipBackendReadyCheck: async () => true,
  },
}));
vi.mock("@editor/constants/connection", () => ({
  STIRLING_SAAS_URL: "https://saas.test",
  STIRLING_SAAS_BACKEND_API_URL: "https://api.saas.test",
}));
vi.mock("@editor/i18n", () => ({
  default: { t: (_key: string, fallback: string) => fallback },
}));

function failRequest(status: number): void {
  vi.mocked(fetch).mockImplementation(
    async () =>
      new Response(JSON.stringify({ message: "Server unavailable" }), {
        status,
      }),
  );
}

describe("desktop background requests through the HTTP interceptors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(operationRouter.getBaseUrl).mockResolvedValue(
      "https://api.saas.test",
    );
    vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue("saas");
    allowConsole.error(/\[TauriHttpClient\]/);
    allowConsole.error(/\[saasErrorInterceptor\]/);
  });
  afterEach(() => vi.useRealTimers());

  it.each(["local", "selfhosted"] as const)(
    "does not fetch or poll the cloud wallet in %s mode",
    async (mode) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.mocked(connectionModeService.getCurrentMode).mockResolvedValue(mode);
      const { result } = renderHook(() => useWallet(), {
        wrapper: TestQueryProvider,
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(90_000);
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(result.current.wallet).toBeNull();
      expect(result.current.loading).toBe(false);
    },
  );

  it("wallet polling exposes the load error without repeated global toasts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    allowConsole.warn(/\[useWallet\] fetch failed/);
    failRequest(500);
    const { result } = renderHook(() => useWallet(), {
      wrapper: TestQueryProvider,
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    const initialRequests = vi.mocked(fetch).mock.calls.length;
    for (let poll = 0; poll < 3; poll++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
    }
    expect(fetch).toHaveBeenCalledTimes(initialRequests + 3);
    expect(alert).not.toHaveBeenCalled();
  });

  it.each([403, 404, 500])(
    "notification polling and resolution stay quiet on HTTP %s",
    async (status) => {
      failRequest(status);

      for (let poll = 0; poll < 3; poll++) {
        expect((await fetchNotifications()).notifications).toEqual([]);
      }
      expect(await reportNotificationResolved("failure:123")).toBe(false);

      expect(fetch).toHaveBeenCalledTimes(4);
      expect(alert).not.toHaveBeenCalled();
    },
  );

  it("lets the signing hook report a failure without per-request toasts", async () => {
    failRequest(500);
    await expect(fetchSigningSessions()).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(alert).not.toHaveBeenCalled();
  });

  it("notification polls stay quiet when the server cannot be reached", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    await fetchNotifications();
    await fetchNotifications();
    expect(alert).not.toHaveBeenCalled();
  });

  it("processing-folder progress polls reject without a toast", async () => {
    failRequest(503);
    for (const poll of [fetchMountedFiles, fetchProcessingFolderRuns]) {
      await expect(poll("folder-1")).rejects.toMatchObject({
        response: { status: 503 },
      });
    }
    expect(alert).not.toHaveBeenCalled();
  });

  it.each(["http://127.0.0.1:8080", "https://api.saas.test"])(
    "a user action refused by %s produces one permission toast",
    async (baseUrl) => {
      vi.mocked(operationRouter.getBaseUrl).mockResolvedValue(baseUrl);
      failRequest(403);
      await expect(
        apiClient.post("/api/v1/general/merge-pdfs"),
      ).rejects.toMatchObject({
        response: { status: 403 },
      });
      expect(alert).toHaveBeenCalledTimes(1);
      expect(alert).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Access Denied" }),
      );
    },
  );

  it("still reports a failed user-requested operation", async () => {
    failRequest(500);
    await expect(
      apiClient.post("/api/v1/general/merge-pdfs"),
    ).rejects.toMatchObject({
      response: { status: 500 },
    });
    expect(alert).toHaveBeenCalledTimes(1);
  });
});
