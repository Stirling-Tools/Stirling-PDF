import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useQuickNavToolReasons } from "@app/components/shared/quickNav/useQuickNavToolReasons";

const h = vi.hoisted(() => ({
  endpointStatus: {} as Record<string, boolean>,
  endpointDetails: {} as Record<string, { reason?: string }>,
  loading: false,
  configLoading: false,
  groupSigningEnabled: true,
}));

vi.mock("@app/hooks/useEndpointConfig", () => ({
  useMultipleEndpointsEnabled: () => ({
    endpointStatus: h.endpointStatus,
    endpointDetails: h.endpointDetails,
    loading: h.loading,
    error: null,
    refetch: async () => {},
  }),
}));

vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({
    config: null,
    loading: h.configLoading,
    error: null,
    refetch: async () => {},
  }),
}));

vi.mock("@app/hooks/useGroupSigningEnabled", () => ({
  useGroupSigningEnabled: () => h.groupSigningEnabled,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

describe("useQuickNavToolReasons", () => {
  beforeEach(() => {
    window.localStorage.clear();
    h.endpointStatus = {};
    h.endpointDetails = {};
    h.loading = false;
    h.configLoading = false;
    h.groupSigningEnabled = true;
  });

  it("admits it does not know rather than reporting nothing wrong", () => {
    h.loading = true;
    h.endpointStatus = { automate: false };

    expect(
      renderHook(() => useQuickNavToolReasons()).result.current,
    ).toBeNull();
  });

  it("reports what it last knew while the answer is being fetched again", () => {
    // Each app has its own query cache, and a reload has none at all.
    h.endpointStatus = { automate: false };
    h.endpointDetails = { automate: { reason: "CONFIG" } };
    renderHook(() => useQuickNavToolReasons());

    h.loading = true;
    h.endpointStatus = {};
    h.endpointDetails = {};

    const { result } = renderHook(() => useQuickNavToolReasons());
    expect(result.current?.automate).toBe("Disabled by server administrator");
  });

  it("forgets a reason once the server stops reporting it", () => {
    h.endpointStatus = { automate: false };
    h.endpointDetails = { automate: { reason: "CONFIG" } };
    renderHook(() => useQuickNavToolReasons());

    h.endpointStatus = { automate: true };
    h.endpointDetails = {};
    expect(renderHook(() => useQuickNavToolReasons()).result.current).toEqual(
      {},
    );

    // The cleared state, not the old reason, is what a reload reads back.
    h.loading = true;
    expect(renderHook(() => useQuickNavToolReasons()).result.current).toEqual(
      {},
    );
  });

  it("says nothing about an endpoint the server reports as available", () => {
    h.endpointStatus = { automate: true };

    expect(renderHook(() => useQuickNavToolReasons()).result.current).toEqual(
      {},
    );
  });

  it("blames the administrator when the endpoint was turned off by config", () => {
    h.endpointStatus = { automate: false };
    h.endpointDetails = { automate: { reason: "CONFIG" } };

    const { result } = renderHook(() => useQuickNavToolReasons());
    // The tool picker's label with its trailing colon stripped.
    expect(result.current?.automate).toBe("Disabled by server administrator");
  });

  it("blames the missing dependency when that is what the server said", () => {
    h.endpointStatus = { automate: false };
    h.endpointDetails = { automate: { reason: "DEPENDENCY" } };

    const { result } = renderHook(() => useQuickNavToolReasons());
    expect(result.current?.automate).toBe(
      "Unavailable - required tool missing on server",
    );
  });

  it("greys out shared signing when the server has the feature switched off", () => {
    // A whole feature rather than a removable endpoint, so it has its own signal.
    h.groupSigningEnabled = false;

    const { result } = renderHook(() => useQuickNavToolReasons());
    expect(result.current?.sharedSign).toBe(
      "Collaborative signing isn't enabled on this server",
    );
  });

  it("waits for the config before judging shared signing", () => {
    // The config loads separately and reads as "off" before it arrives.
    h.configLoading = true;
    h.groupSigningEnabled = false;

    expect(
      renderHook(() => useQuickNavToolReasons()).result.current,
    ).toBeNull();
  });
});
