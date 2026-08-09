import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import {
  SubcategoryId,
  ToolCategoryId,
  ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import { useToolSections } from "@app/hooks/useToolSections";
import { useToolRecommendations } from "@app/hooks/useToolRecommendations";
import { ToolId } from "@app/types/toolId";

vi.mock("@app/hooks/useToolRecommendations", () => ({
  useToolRecommendations: vi.fn(),
}));

const mockUseToolRecommendations = vi.mocked(useToolRecommendations);

function makeTool(
  overrides: Partial<ToolRegistryEntry> = {},
): ToolRegistryEntry {
  return {
    icon: null,
    name: "Tool",
    component: (() => null) as never,
    description: "",
    categoryId: ToolCategoryId.STANDARD_TOOLS,
    subcategoryId: SubcategoryId.GENERAL,
    automationSettings: null,
    ...overrides,
  } as ToolRegistryEntry;
}

function entry(id: string, tool: ToolRegistryEntry) {
  return { item: [id as ToolId, tool] as [ToolId, ToolRegistryEntry] };
}

const registryFixture = [
  entry(
    "merge",
    makeTool({
      name: "Merge",
      categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
      subcategoryId: SubcategoryId.GENERAL,
    }),
  ),
  entry(
    "compare",
    makeTool({
      name: "Compare",
      categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
      subcategoryId: SubcategoryId.DOCUMENT_REVIEW,
    }),
  ),
  entry(
    "ocr",
    makeTool({ name: "OCR", subcategoryId: SubcategoryId.EXTRACTION }),
  ),
  entry(
    "split",
    makeTool({ name: "Split", subcategoryId: SubcategoryId.PAGE_FORMATTING }),
  ),
  entry(
    "removePassword",
    makeTool({
      name: "Remove password",
      subcategoryId: SubcategoryId.DOCUMENT_SECURITY,
      // Not ready: no component and no link, so never shown in Quick Access.
      component: null,
    }),
  ),
];

type SectionsResult = {
  sections: { key: string; subcategories: { tools: { id: ToolId }[] }[] }[];
};

function sectionIds(result: SectionsResult, key: string): ToolId[] {
  const section = result.sections.find((s) => s.key === key);
  return section
    ? section.subcategories.flatMap((sc) => sc.tools.map((t) => t.id))
    : [];
}

const quickIds = (result: SectionsResult) => sectionIds(result, "quick");
const allIds = (result: SectionsResult) => sectionIds(result, "all");

describe("useToolSections recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the static recommended list when no usage data exists", () => {
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: null,
      contextTool: null,
    });

    const { result } = renderHook(() => useToolSections(registryFixture));

    expect(quickIds(result.current)).toEqual(["compare", "merge"]);
    expect(result.current.dynamicRecommendations).toBe(false);
  });

  it("replaces the quick list with the usage ranking, preserving score order", () => {
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: ["split", "ocr", "merge"] as ToolId[],
      contextTool: null,
    });

    const { result } = renderHook(() => useToolSections(registryFixture));

    expect(quickIds(result.current)).toEqual(["split", "ocr", "merge"]);
    expect(result.current.dynamicRecommendations).toBe(true);
  });

  it("drops recommended ids that are unknown or not ready", () => {
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: ["removePassword", "ocr", "automate"] as ToolId[],
      contextTool: null,
    });

    const { result } = renderHook(() => useToolSections(registryFixture));

    expect(quickIds(result.current)).toEqual(["ocr"]);
  });

  it("falls back to the static list when no recommended id survives filtering", () => {
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: ["automate"] as ToolId[],
      contextTool: null,
    });

    const { result } = renderHook(() => useToolSections(registryFixture));

    expect(quickIds(result.current)).toEqual(["compare", "merge"]);
    expect(result.current.dynamicRecommendations).toBe(false);
  });

  it("never lists a tool in both Quick Access and All Tools", () => {
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: ["ocr", "merge"] as ToolId[],
      contextTool: null,
    });

    const { result } = renderHook(() => useToolSections(registryFixture));

    const quick = quickIds(result.current);
    const all = allIds(result.current);
    expect(quick).toEqual(["ocr", "merge"]);
    expect(all.filter((id) => quick.includes(id))).toEqual([]);
  });

  it("keeps statically recommended tools reachable when the ranking displaces them", () => {
    // 'compare' and 'merge' are Recommended-category tools. With a dynamic list that
    // omits them they must fall back into All Tools, not vanish from the UI entirely.
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: ["ocr", "split"] as ToolId[],
      contextTool: null,
    });

    const { result } = renderHook(() => useToolSections(registryFixture));

    expect(quickIds(result.current)).toEqual(["ocr", "split"]);
    expect(allIds(result.current)).toEqual(
      expect.arrayContaining(["compare", "merge"]),
    );
  });

  it("still hides the static recommended tools from All Tools when no ranking exists", () => {
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: null,
      contextTool: null,
    });

    const { result } = renderHook(() => useToolSections(registryFixture));

    expect(quickIds(result.current)).toEqual(["compare", "merge"]);
    expect(allIds(result.current)).not.toContain("merge");
    expect(allIds(result.current)).toEqual(
      expect.arrayContaining(["ocr", "split", "removePassword"]),
    );
  });
});
