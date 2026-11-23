import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useConversionCloudStatus } from "@editor/hooks/useConversionCloudStatus";

const probe = vi.hoisted(() => ({ hang: false }));
const mode = vi.hoisted(() => ({
  current: "local" as "local" | "saas" | "selfhosted",
  listeners: new Set<() => void>(),
}));

vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: {
    getCurrentMode: async () => mode.current,
    subscribeToModeChanges: (listener: () => void) => {
      mode.listeners.add(listener);
      return () => mode.listeners.delete(listener);
    },
  },
}));
vi.mock("@editor/services/endpointAvailabilityService", () => ({
  endpointAvailabilityService: {
    isEndpointSupportedLocally: (endpoint: string) =>
      probe.hang
        ? new Promise<boolean>(() => {})
        : Promise.resolve(endpoint !== "pdf-to-word"),
  },
}));
vi.mock("@editor/services/tauriBackendService", () => ({
  tauriBackendService: {
    isOnline: true,
    getBackendUrl: () => "http://localhost:8080",
    subscribeToStatus: () => () => {},
  },
}));
vi.mock("@editor/services/selfHostedServerMonitor", () => ({
  selfHostedServerMonitor: {
    getSnapshot: () => ({ status: "idle" }),
    subscribe: () => () => {},
  },
}));
vi.mock("@editor/hooks/useLocalProcessingOnly", () => ({
  useLocalProcessingOnly: () => false,
}));
vi.mock("@editor/hooks/useEndpointConfig", () => ({
  useMultipleEndpointsEnabled: () => ({ endpointStatus: {} }),
}));

describe("useConversionCloudStatus", () => {
  it("re-checks conversions when signing in switches the connection mode", async () => {
    probe.hang = false;
    mode.current = "local";
    const { result } = renderHook(() => useConversionCloudStatus());

    await waitFor(() => expect(result.current.availability).toEqual({}));

    mode.current = "saas";
    act(() => mode.listeners.forEach((listener) => listener()));

    await waitFor(() =>
      expect(result.current.cloudStatus["pdf-docx"]).toBe(true),
    );
    expect(result.current.availability["pdf-docx"]).toBe(true);
  });

  it("reports SaaS conversions as available before the local probes answer", async () => {
    probe.hang = true;
    mode.current = "saas";
    const { result } = renderHook(() => useConversionCloudStatus());

    await waitFor(() =>
      expect(result.current.availability["pdf-docx"]).toBe(true),
    );
    expect(Object.values(result.current.availability).every(Boolean)).toBe(
      true,
    );
  });
});
