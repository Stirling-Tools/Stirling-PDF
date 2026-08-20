import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useSuggestedTools } from "@app/hooks/useSuggestedTools";
import { useToolRecommendations } from "@app/hooks/useToolRecommendations";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import type { ToolId } from "@app/types/toolId";
import type { ToolRegistryEntry } from "@app/data/toolsTaxonomy";

vi.mock("@app/hooks/useToolRecommendations", () => ({
  useToolRecommendations: vi.fn(),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: vi.fn(),
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: vi.fn(),
}));
vi.mock("@app/hooks/useToolNavigation", () => ({
  useToolNavigation: () => ({
    getToolNavigation: (toolId: string) => ({
      href: `/${toolId}`,
      onClick: () => {},
    }),
  }),
}));

const mockRecommendations = vi.mocked(useToolRecommendations);
const mockNavigation = vi.mocked(useNavigationState);
const mockWorkflow = vi.mocked(useToolWorkflow);

/** A tool that can actually open, so it survives the availability filter. */
function entry(name: string): ToolRegistryEntry {
  return {
    name,
    icon: null,
    component: (() => null) as unknown as ToolRegistryEntry["component"],
  } as ToolRegistryEntry;
}

const REGISTRY: Partial<Record<ToolId, ToolRegistryEntry>> = {
  compress: entry("Compress"),
  convert: entry("Convert"),
  sanitize: entry("Sanitize"),
  split: entry("Split"),
  ocr: entry("OCR"),
  addPassword: entry("Add Password"),
  merge: entry("Merge"),
  // No component and no link - nothing to open.
  automate: {
    name: "Automate",
    icon: null,
    component: null,
  } as ToolRegistryEntry,
};

function setup(
  recommendedToolIds: ToolId[] | null,
  selectedTool: ToolId | null = null,
) {
  mockRecommendations.mockReturnValue({
    recommendedToolIds,
    contextTool: selectedTool,
  });
  mockNavigation.mockReturnValue({ selectedTool } as ReturnType<
    typeof useNavigationState
  >);
  mockWorkflow.mockReturnValue({
    getSelectedTool: (id: ToolId | null) =>
      id ? (REGISTRY[id] ?? null) : null,
  } as unknown as ReturnType<typeof useToolWorkflow>);

  return renderHook(() => useSuggestedTools()).result.current.map((t) => t.id);
}

describe("useSuggestedTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the curated list when the backend has no usage data", () => {
    expect(setup(null)).toEqual(["compress", "convert", "sanitize", "split"]);
  });

  it("leads with the usage ranking, then tops up from the curated list", () => {
    expect(setup(["addPassword", "merge"])).toEqual([
      "addPassword",
      "merge",
      "compress",
      "convert",
    ]);
  });

  it("never suggests the tool the user is currently in", () => {
    expect(setup(["compress", "addPassword"], "compress")).toEqual([
      "addPassword",
      "convert",
      "sanitize",
      "split",
    ]);
  });

  it("skips tools that are unknown or cannot open", () => {
    expect(setup(["automate", "nonsense" as ToolId, "merge"])).toEqual([
      "merge",
      "compress",
      "convert",
      "sanitize",
    ]);
  });

  it("does not repeat a ranked tool that is also in the curated list", () => {
    const ids = setup(["split", "compress"]);
    expect(ids).toEqual(["split", "compress", "convert", "sanitize"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
