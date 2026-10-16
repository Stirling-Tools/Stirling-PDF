import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigationType } from "react-router-dom";
import type { ToolId } from "@app/types/toolId";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";

vi.mock("@app/utils/scarfTracking", () => ({ firePixel: vi.fn() }));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { premiumEnabled: true } }),
}));

import { useNavigationUrlSync } from "@app/hooks/useUrlSync";

const registry = {
  convert: { name: "Convert" },
  compress: { name: "Compress" },
} as unknown as ToolRegistry;

function wrapperAt(entry: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
  );
}

/** Selection state the way ToolWorkflowContext keeps it, plus the address. */
function useHarness(
  initialTool: ToolId | null,
  select: (id: ToolId, options?: { preset?: string }) => void,
) {
  const [selected, setSelected] = useState<ToolId | null>(initialTool);
  useNavigationUrlSync(
    selected,
    (id, options) => {
      select(id, options);
      setSelected(id);
    },
    () => setSelected(null),
    registry,
  );
  const location = useLocation();
  return { location, navigationType: useNavigationType() };
}

describe("useNavigationUrlSync — address presets", () => {
  it("opens the tool with the preset and replaces the address without it", async () => {
    const select = vi.fn();
    const { result } = renderHook(() => useHarness(null, select), {
      wrapper: wrapperAt("/convert?preset=pdf-to-png"),
    });
    await act(async () => {});
    expect(select).toHaveBeenCalledWith("convert", { preset: "pdf-to-png" });
    expect(
      result.current.location.pathname + result.current.location.search,
    ).toBe("/convert");
    // Replaced, so Back can't land on the preset address and apply it again.
    expect(result.current.navigationType).toBe("REPLACE");
  });

  it("applies a preset to the tool that's already open", async () => {
    const select = vi.fn();
    const { result } = renderHook(() => useHarness("convert", select), {
      wrapper: wrapperAt("/convert?preset=pdf-to-pdfa-1b"),
    });
    await act(async () => {});
    expect(select).toHaveBeenCalledWith("convert", {
      preset: "pdf-to-pdfa-1b",
    });
    expect(result.current.location.search).toBe("");
    expect(result.current.navigationType).toBe("REPLACE");
  });
});
