import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import type { ToolId } from "@app/types/toolId";

const h = vi.hoisted(() => ({
  updateToolRoute: vi.fn(),
  clearToolRoute: vi.fn(),
}));

vi.mock("@app/utils/urlRouting", () => ({
  parseToolRoute: () => ({ workbench: "fileEditor", toolId: null }),
  updateToolRoute: h.updateToolRoute,
  clearToolRoute: h.clearToolRoute,
}));
vi.mock("@app/utils/scarfTracking", () => ({ firePixel: vi.fn() }));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { premiumEnabled: true } }),
}));

import { useNavigationUrlSync } from "@app/hooks/useUrlSync";

const registry = {
  read: { name: "Read", workbench: "viewer" },
  compress: { name: "Compress", workbench: "fileEditor" },
} as never;

/** Drives the hook the way ToolWorkflowContext does, with a startup marker. */
function useHarness(selectedTool: ToolId | null, startupTool: ToolId | null) {
  const ref = useRef<ToolId | null>(startupTool);
  useNavigationUrlSync(selectedTool, vi.fn(), vi.fn(), registry, true, ref);
  return ref;
}

describe("useNavigationUrlSync — startup-view selections", () => {
  beforeEach(() => h.updateToolRoute.mockClear());

  // The default-startup-view preference selects a tool to change the *view*.
  // Writing it to the address turned every visit to /editor into /read.
  it("never writes the URL for the startup-applied tool", () => {
    const { rerender } = renderHook(
      ({ tool }: { tool: ToolId | null }) => useHarness(tool, "read" as ToolId),
      { initialProps: { tool: null as ToolId | null } },
    );
    rerender({ tool: "read" as ToolId });
    expect(h.updateToolRoute).not.toHaveBeenCalled();
  });

  // The effect re-runs whenever the registry identity changes, so a marker that
  // was consumed on first sight let the second run write /read anyway.
  it("survives a re-run for the same tool", () => {
    const { rerender } = renderHook(
      ({ tool }: { tool: ToolId | null }) => useHarness(tool, "read" as ToolId),
      { initialProps: { tool: null as ToolId | null } },
    );
    rerender({ tool: "read" as ToolId });
    rerender({ tool: "read" as ToolId });
    rerender({ tool: "read" as ToolId });
    expect(h.updateToolRoute).not.toHaveBeenCalled();
  });

  it("still writes the URL when the user picks a different tool", () => {
    const { rerender } = renderHook(
      ({ tool }: { tool: ToolId | null }) => useHarness(tool, "read" as ToolId),
      { initialProps: { tool: null as ToolId | null } },
    );
    rerender({ tool: "read" as ToolId });
    rerender({ tool: "compress" as ToolId });
    expect(h.updateToolRoute).toHaveBeenCalledWith("compress", registry, false);
  });

  it("writes the URL for a tool chosen without a startup marker", () => {
    const { rerender } = renderHook(
      ({ tool }: { tool: ToolId | null }) => useHarness(tool, null),
      { initialProps: { tool: null as ToolId | null } },
    );
    rerender({ tool: "read" as ToolId });
    expect(h.updateToolRoute).toHaveBeenCalledWith("read", registry, false);
  });
});
