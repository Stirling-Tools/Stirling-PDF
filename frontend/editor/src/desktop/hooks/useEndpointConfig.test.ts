import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useEndpointEnabled } from "@app/hooks/useEndpointConfig";
import apiClient from "@app/services/apiClient";

vi.mock("@app/services/apiClient", () => ({ default: { get: vi.fn() } }));
vi.mock("@app/services/tauriBackendService", () => ({
  tauriBackendService: { isOnline: true, subscribeToStatus: () => () => {} },
}));
vi.mock("@app/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: { getSnapshot: () => ({ status: "online" }) },
}));
vi.mock("@app/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: {},
}));
vi.mock("@app/constants/backendErrors", () => ({
  isBackendNotReadyError: () => false,
}));
vi.mock("@app/services/connectionModeService", () => ({
  connectionModeService: { getCurrentMode: vi.fn().mockResolvedValue("saas") },
}));
vi.mock("react-i18next", () => {
  const t = (_key: string, fallback: string) => fallback;
  return { useTranslation: () => ({ t }) };
});

describe("desktop URL to PDF availability", () => {
  const response = (data: unknown) => ({
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: {},
  });
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });
  it("starts hidden until the backend confirms it is enabled", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(response({ dependenciesReady: true }))
      .mockResolvedValueOnce(response(true));
    const { result } = renderHook(() => useEndpointEnabled("url-to-pdf"));
    expect(result.current.enabled).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(true);
  });
  it("does not override disabled status with SaaS availability", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(response({ dependenciesReady: true }))
      .mockResolvedValueOnce(response(false));
    const { result } = renderHook(() => useEndpointEnabled("url-to-pdf"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(false);
  });
  it("stays hidden after a failed check in SaaS mode", async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce(response({ dependenciesReady: true }))
      .mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useEndpointEnabled("url-to-pdf"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(false);
    expect(result.current.error).toBe("offline");
  });
});
