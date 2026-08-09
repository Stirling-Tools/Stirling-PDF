import { useMemo } from "react";

import {
  SUBCATEGORY_ORDER,
  SubcategoryId,
  ToolCategoryId,
  ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import { useTranslation } from "react-i18next";
import { useToolRecommendations } from "@app/hooks/useToolRecommendations";
import { ToolId } from "@app/types/toolId";

/** Tools that can actually open: have a component, an external link, or are navigational. */
const isReadyTool = ({ tool, id }: { tool: ToolRegistryEntry; id: ToolId }) =>
  tool.component !== null || !!tool.link || id === "read" || id === "multiTool";

type SubcategoryIdMap = {
  [subcategoryId in SubcategoryId]: Array<{
    id: ToolId;
    tool: ToolRegistryEntry;
  }>;
};

type GroupedTools = {
  [categoryId in ToolCategoryId]: SubcategoryIdMap;
};

export interface SubcategoryGroup {
  subcategoryId: SubcategoryId;
  tools: {
    id: ToolId;
    tool: ToolRegistryEntry;
  }[];
}

export type ToolSectionKey = "quick" | "all";

export interface ToolSection {
  key: ToolSectionKey;
  title: string;
  subcategories: SubcategoryGroup[];
}

export function useToolSections(
  filteredTools: Array<{
    item: [ToolId, ToolRegistryEntry];
    matchedText?: string;
  }>,
  searchQuery?: string,
) {
  const { t } = useTranslation();
  const { recommendedToolIds } = useToolRecommendations();

  const groupedTools = useMemo(() => {
    if (!filteredTools || !Array.isArray(filteredTools)) {
      return {} as GroupedTools;
    }

    const grouped = {} as GroupedTools;
    filteredTools.forEach(({ item: [id, tool] }) => {
      const categoryId = tool.categoryId;
      const subcategoryId = tool.subcategoryId;
      if (!grouped[categoryId]) grouped[categoryId] = {} as SubcategoryIdMap;
      if (!grouped[categoryId][subcategoryId])
        grouped[categoryId][subcategoryId] = [];
      grouped[categoryId][subcategoryId].push({ id, tool });
    });
    return grouped;
  }, [filteredTools]);

  const { sections, dynamicRecommendations } = useMemo(() => {
    const getOrderIndex = (id: SubcategoryId) => {
      const idx = SUBCATEGORY_ORDER.indexOf(id);
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };

    // Every tool starts in 'all'; whatever Quick Access ends up showing is removed
    // from it below, so a tool is never listed twice nor lost when the quick list changes.
    let quick = {} as SubcategoryIdMap;
    const all = {} as SubcategoryIdMap;

    Object.entries(groupedTools).forEach(([c, subs]) => {
      const categoryId = c as ToolCategoryId;

      Object.entries(subs).forEach(([s, tools]) => {
        const subcategoryId = s as SubcategoryId;
        if (!all[subcategoryId]) all[subcategoryId] = [];
        all[subcategoryId].push(...tools);

        if (categoryId === ToolCategoryId.RECOMMENDED_TOOLS) {
          if (!quick[subcategoryId]) quick[subcategoryId] = [];
          // Only include ready tools (have a component or external link) in Quick Access
          // Special case: read and multiTool are navigational tools that don't need components
          quick[subcategoryId].push(...tools.filter(isReadyTool));
        }
      });
    });

    // Usage-ranked recommendations replace the static quick list when available.
    // A single bucket preserves the backend's score order through subcategory sorting.
    let usedDynamicQuick = false;
    if (recommendedToolIds) {
      const byId = new Map<ToolId, ToolRegistryEntry>();
      filteredTools.forEach(({ item: [id, tool] }) => byId.set(id, tool));
      const dynamicTools = recommendedToolIds
        .filter((id) => byId.has(id))
        .map((id) => ({ id, tool: byId.get(id)! }))
        .filter(isReadyTool);
      if (dynamicTools.length > 0) {
        quick = { [SubcategoryId.GENERAL]: dynamicTools } as SubcategoryIdMap;
        usedDynamicQuick = true;
      }
    }

    const quickIds = new Set(
      Object.values(quick).flatMap((tools) => tools.map(({ id }) => id)),
    );
    Object.keys(all).forEach((key) => {
      const subcategoryId = key as SubcategoryId;
      all[subcategoryId] = all[subcategoryId].filter(
        ({ id }) => !quickIds.has(id),
      );
      if (all[subcategoryId].length === 0) delete all[subcategoryId];
    });

    const sortSubs = (obj: SubcategoryIdMap) =>
      Object.entries(obj)
        .sort(([a], [b]) => {
          const aId = a as SubcategoryId;
          const bId = b as SubcategoryId;
          const ai = getOrderIndex(aId);
          const bi = getOrderIndex(bId);
          if (ai !== bi) return ai - bi;
          return aId.localeCompare(bId);
        })
        .map(
          ([subcategoryId, tools]) =>
            ({ subcategoryId, tools }) as SubcategoryGroup,
        );

    const built: ToolSection[] = [
      {
        key: "quick",
        title: t("toolPicker.quickAccess", "QUICK ACCESS"),
        subcategories: sortSubs(quick),
      },
      {
        key: "all",
        title: t("toolPicker.allTools", "ALL TOOLS"),
        subcategories: sortSubs(all),
      },
    ];

    return {
      sections: built.filter((section) =>
        section.subcategories.some((sc) => sc.tools.length > 0),
      ),
      dynamicRecommendations: usedDynamicQuick,
    };
  }, [groupedTools, recommendedToolIds, filteredTools, t]);

  const searchGroups: SubcategoryGroup[] = useMemo(() => {
    if (!filteredTools || !Array.isArray(filteredTools)) {
      return [];
    }

    const subMap = {} as SubcategoryIdMap;
    const seen = new Set<ToolId>();
    filteredTools.forEach(({ item: [id, tool] }) => {
      const toolId = id as ToolId;
      if (seen.has(toolId)) return;
      seen.add(toolId);
      const sub = tool.subcategoryId;
      if (!subMap[sub]) subMap[sub] = [];
      subMap[sub].push({ id: toolId as ToolId, tool });
    });
    const entries = Object.entries(subMap);

    // If a search query is present, always order subcategories by first occurrence in
    // the ranked filteredTools list so the top-ranked tools' subcategory appears first.
    if (searchQuery && searchQuery.trim()) {
      const order: SubcategoryId[] = [];
      filteredTools.forEach(({ item: [_, tool] }) => {
        const sc = tool.subcategoryId;
        if (!order.includes(sc)) order.push(sc);
      });
      return entries
        .sort(([a], [b]) => {
          const ai = order.indexOf(a as SubcategoryId);
          const bi = order.indexOf(b as SubcategoryId);
          if (ai !== bi) return ai - bi;
          return (a as SubcategoryId).localeCompare(b as SubcategoryId);
        })
        .map(
          ([subcategoryId, tools]) =>
            ({ subcategoryId, tools }) as SubcategoryGroup,
        );
    }

    // No search: alphabetical subcategory ordering
    return entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([subcategoryId, tools]) =>
          ({ subcategoryId, tools }) as SubcategoryGroup,
      );
  }, [filteredTools, searchQuery]);

  return { sections, searchGroups, dynamicRecommendations };
}
