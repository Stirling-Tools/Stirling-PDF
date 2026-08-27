import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useQuickNavToolReasons } from "@app/components/shared/quickNav/useQuickNavToolReasons";

/**
 * The rail reads this itself rather than being told by the app around it, so that
 * the editor and the processor cannot disagree about whether the same entry works.
 * What is worth pinning is the wording it picks and its refusal to guess early.
 */

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
    // Null, not an empty map. "Nothing is wrong" while the answer is merely being
    // fetched is what flashed a dimmed entry back to usable.
    h.loading = true;
    h.endpointStatus = { automate: false };

    expect(
      renderHook(() => useQuickNavToolReasons()).result.current,
    ).toBeNull();
  });

  it("reports what it last knew while the answer is being fetched again", () => {
    // The reason a reload no longer flashes: each app has its own query cache and a
    // reload has none at all, so without this the entry draws as usable every time
    // and dims a moment later.
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
    // Held onto only until the answer actually changes, not indefinitely.
    h.endpointStatus = { automate: false };
    h.endpointDetails = { automate: { reason: "CONFIG" } };
    renderHook(() => useQuickNavToolReasons());

    h.endpointStatus = { automate: true };
    h.endpointDetails = {};
    expect(renderHook(() => useQuickNavToolReasons()).result.current).toEqual(
      {},
    );

    // And the change is what survives the next reload.
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
    // The picker's wording for the same condition, with the trailing colon gone
    // because the rail appends it after the entry's own label.
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
    // Not an endpoint that can be removed but a whole feature that can be turned
    // off, so it needs its own signal - and it is the tool's own wording.
    h.groupSigningEnabled = false;

    const { result } = renderHook(() => useQuickNavToolReasons());
    expect(result.current?.sharedSign).toBe(
      "Collaborative signing isn't enabled on this server",
    );
  });

  it("waits for the config before judging shared signing", () => {
    // The config loads separately from the endpoint list, and reads as "off"
    // before it arrives - which would grey the entry out and then light it up.
    h.configLoading = true;
    h.groupSigningEnabled = false;

    expect(
      renderHook(() => useQuickNavToolReasons()).result.current,
    ).toBeNull();
  });
});
