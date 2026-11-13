import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  TOOL_PANEL_WIDTHS,
  useToolPanelSize,
  useToolPanelWidth,
} from "@editor/hooks/useToolPanelSize";

describe("useToolPanelSize", () => {
  it("widens the panel while mounted and restores sm on unmount", async () => {
    const width = renderHook(() => useToolPanelWidth());
    expect(width.result.current).toBe(TOOL_PANEL_WIDTHS.sm);

    const request = renderHook(() => useToolPanelSize("lg"));
    await waitFor(() =>
      expect(width.result.current).toBe(TOOL_PANEL_WIDTHS.lg),
    );

    request.unmount();
    await waitFor(() =>
      expect(width.result.current).toBe(TOOL_PANEL_WIDTHS.sm),
    );
  });

  it("keeps the incoming tool's size when one tool replaces another", async () => {
    const width = renderHook(() => useToolPanelWidth());
    const outgoing = renderHook(() => useToolPanelSize("md"));
    await waitFor(() =>
      expect(width.result.current).toBe(TOOL_PANEL_WIDTHS.md),
    );

    outgoing.unmount();
    const incoming = renderHook(() => useToolPanelSize("lg"));
    await waitFor(() =>
      expect(width.result.current).toBe(TOOL_PANEL_WIDTHS.lg),
    );
    incoming.unmount();
    await waitFor(() =>
      expect(width.result.current).toBe(TOOL_PANEL_WIDTHS.sm),
    );
  });
});
