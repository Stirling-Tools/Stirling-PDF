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

// useToolSections imports the limit from here too, so the mock must supply it.
const LIMIT = 8;
vi.mock("@app/hooks/useToolRecommendations", () => ({
  DEFAULT_RECOMMENDATION_LIMIT: 8,
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
  rankedRecommendationIds: Set<ToolId>;
};

function sectionIds(result: SectionsResult, key: string): ToolId[] {
  const section = result.sections.find((s) => s.key === key);
  return section
    ? section.subcategories.flatMap((sc) => sc.tools.map((t) => t.id))
    : [];
}

const quickIds = (result: SectionsResult) => sectionIds(result, "quick");
const allIds = (result: SectionsResult) => sectionIds(result, "all");
const rankedIds = (result: SectionsResult) => [
  ...result.rankedRecommendationIds,
];

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
    expect(rankedIds(result.current)).toEqual([]);
  });

  it("leads with the usage ranking in score order, then tops up from the static list", () => {
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: ["split", "ocr", "merge"] as ToolId[],
      contextTool: null,
    });

    const { result } = renderHook(() => useToolSections(registryFixture));

    // 'compare' is the only curated entry the ranking did not already cover.
    expect(quickIds(result.current)).toEqual([
      "split",
      "ocr",
      "merge",
      "compare",
    ]);
    expect(rankedIds(result.current)).toEqual(["split", "ocr", "merge"]);
  });

  it("drops recommended ids that are unknown or not ready", () => {
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: ["removePassword", "ocr", "automate"] as ToolId[],
      contextTool: null,
    });

    const { result } = renderHook(() => useToolSections(registryFixture));

    expect(quickIds(result.current)).toEqual(["ocr", "compare", "merge"]);
    expect(rankedIds(result.current)).toEqual(["ocr"]);
  });

  it("falls back to the static list when no recommended id survives filtering", () => {
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: ["automate"] as ToolId[],
      contextTool: null,
    });

    const { result } = renderHook(() => useToolSections(registryFixture));

    expect(quickIds(result.current)).toEqual(["compare", "merge"]);
    expect(rankedIds(result.current)).toEqual([]);
  });

  it("never lists a tool in both Quick Access and All Tools", () => {
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: ["ocr", "merge"] as ToolId[],
      contextTool: null,
    });

    const { result } = renderHook(() => useToolSections(registryFixture));

    const quick = quickIds(result.current);
    const all = allIds(result.current);
    expect(quick).toEqual(["ocr", "merge", "compare"]);
    expect(all.filter((id) => quick.includes(id))).toEqual([]);
  });

  it("keeps the statically recommended tools in Quick Access when the ranking omits them", () => {
    // The regression this guards: a couple of tool runs used to replace the whole
    // curated list, collapsing Quick Access to one or two entries on a fresh install.
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: ["ocr"] as ToolId[],
      contextTool: null,
    });

    const { result } = renderHook(() => useToolSections(registryFixture));

    expect(quickIds(result.current)).toEqual(["ocr", "compare", "merge"]);
    expect(allIds(result.current)).not.toContain("merge");
  });

  it("tops the quick list up to the limit and no further", () => {
    const curated = Array.from({ length: LIMIT }, (_, i) =>
      entry(
        `static${i}`,
        makeTool({
          name: `Static ${i}`,
          categoryId: ToolCategoryId.RECOMMENDED_TOOLS,
          subcategoryId: SubcategoryId.GENERAL,
        }),
      ),
    );
    mockUseToolRecommendations.mockReturnValue({
      recommendedToolIds: ["ocr"] as ToolId[],
      contextTool: null,
    });

    const { result } = renderHook(() =>
      useToolSections([...curated, entry("ocr", makeTool({ name: "OCR" }))]),
    );

    // One ranked tool leads; the curated entries fill the remaining slots.
    const quick = quickIds(result.current);
    expect(quick).toHaveLength(LIMIT);
    expect(quick[0]).toBe("ocr");
    expect(quick).not.toContain(`static${LIMIT - 1}`);
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
