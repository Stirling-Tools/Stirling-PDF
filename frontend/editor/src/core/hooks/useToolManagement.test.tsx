import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useToolManagement } from "@app/hooks/useToolManagement";
import {
  useEndpointEnabled,
  useMultipleEndpointsEnabled,
} from "@app/hooks/useEndpointConfig";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useSaaSMode } from "@app/hooks/useSaaSMode";

vi.mock("@app/contexts/ToolRegistryContext", () => ({
  useToolRegistry: () => ({
    allTools: {
      urlToPdf: { component: () => null, endpoints: ["url-to-pdf"] },
      rotate: { component: () => null, endpoints: ["rotate-pdf"] },
    },
  }),
}));
vi.mock("@app/contexts/PreferencesContext", () => ({
  usePreferences: vi.fn(),
}));
vi.mock("@app/hooks/useEndpointConfig", () => ({
  useEndpointEnabled: vi.fn(),
  useMultipleEndpointsEnabled: vi.fn(),
}));
vi.mock("@app/hooks/useSaaSMode", () => ({ useSaaSMode: vi.fn() }));

describe("URL to PDF visibility", () => {
  beforeEach(() => {
    vi.mocked(usePreferences).mockReturnValue({
      preferences: { hideUnavailableTools: false },
    } as ReturnType<typeof usePreferences>);
    vi.mocked(useSaaSMode).mockReturnValue(false);
    vi.mocked(useMultipleEndpointsEnabled).mockReturnValue({
      endpointStatus: { "url-to-pdf": true, "rotate-pdf": true },
      endpointDetails: {},
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(useEndpointEnabled).mockReturnValue({
      enabled: true,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("shows the enabled tool and makes it selectable", () => {
    const { result } = renderHook(useToolManagement);
    expect(result.current.toolRegistry.urlToPdf).toBeDefined();
    expect(result.current.getSelectedTool("urlToPdf")).not.toBeNull();
    expect(result.current.toolAvailability.urlToPdf?.available).toBe(true);
  });

  it.each([
    { enabled: false, loading: false, error: null },
    { enabled: null, loading: true, error: null },
    { enabled: true, loading: true, error: null },
    { enabled: true, loading: false, error: "Failed to fetch" },
    { enabled: null, loading: false, error: null },
  ])("fully hides the tool for %j", (status) => {
    vi.mocked(useEndpointEnabled).mockReturnValue({
      ...status,
      refetch: vi.fn(),
    });
    const { result } = renderHook(useToolManagement);
    expect(result.current.toolRegistry.urlToPdf).toBeUndefined();
    expect(result.current.getSelectedTool("urlToPdf")).toBeNull();
    expect(result.current.toolAvailability.urlToPdf?.available).toBe(
      status.loading ? undefined : false,
    );
    expect(result.current.toolRegistry.rotate).toBeDefined();
  });

  it("does not let cloud fallback expose a disabled URL tool", () => {
    vi.mocked(useSaaSMode).mockReturnValue(true);
    vi.mocked(useEndpointEnabled).mockReturnValue({
      enabled: false,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    const { result } = renderHook(useToolManagement);
    expect(result.current.toolRegistry.urlToPdf).toBeUndefined();
  });

  it("tracks availability changes without changing the unavailable-tools preference", () => {
    const { result, rerender } = renderHook(useToolManagement);
    expect(result.current.toolRegistry.urlToPdf).toBeDefined();
    vi.mocked(useEndpointEnabled).mockReturnValue({
      enabled: false,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    rerender();
    expect(result.current.toolRegistry.urlToPdf).toBeUndefined();
    vi.mocked(useEndpointEnabled).mockReturnValue({
      enabled: true,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    rerender();
    expect(result.current.toolRegistry.urlToPdf).toBeDefined();
  });
});
