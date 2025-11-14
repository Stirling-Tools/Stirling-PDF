import { useMemo } from 'react';

import { SUBCATEGORY_ORDER, SubcategoryId, ToolCategoryId, ToolRegistryEntry } from '@app/data/toolsTaxonomy';
import { useTranslation } from 'react-i18next';
import { ToolId } from "@app/types/toolId";

type SubcategoryIdMap = {
  [subcategoryId in SubcategoryId]: Array<{ id: ToolId; tool: ToolRegistryEntry }>;
}

type GroupedTools = {
  [categoryId in ToolCategoryId]: SubcategoryIdMap;
};

export interface SubcategoryGroup {
  subcategoryId: SubcategoryId;
  tools: {
    id: ToolId;
    tool: ToolRegistryEntry;
  }[];
};

export type ToolSectionKey = 'quick' | 'all';

export interface ToolSection {
  key: ToolSectionKey;
  title: string;
  subcategories: SubcategoryGroup[];
};

export function useToolSections(
  filteredTools: Array<{ item: [ToolId, ToolRegistryEntry]; matchedText?: string }>,
  searchQuery?: string
) {
  const { t } = useTranslation();

  const groupedTools = useMemo(() => {
    if (!filteredTools || !Array.isArray(filteredTools)) {
      return {} as GroupedTools;
    }

    const grouped = {} as GroupedTools;
    filteredTools.forEach(({ item: [id, tool] }) => {
      const categoryId = tool.categoryId;
      const subcategoryId = tool.subcategoryId;
      if (!grouped[categoryId]) grouped[categoryId] = {} as SubcategoryIdMap;
      if (!grouped[categoryId][subcategoryId]) grouped[categoryId][subcategoryId] = [];
      grouped[categoryId][subcategoryId].push({ id, tool });
    });
    return grouped;
  }, [filteredTools]);

  const sections: ToolSection[] = useMemo(() => {
    const getOrderIndex = (id: SubcategoryId) => {
      const idx = SUBCATEGORY_ORDER.indexOf(id);
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };

    const quick = {} as SubcategoryIdMap;
    const all = {} as SubcategoryIdMap;

    Object.entries(groupedTools).forEach(([c, subs]) => {
      const categoryId = c as ToolCategoryId;

      Object.entries(subs).forEach(([s, tools]) => {
        const subcategoryId = s as SubcategoryId;
        // Build the 'all' collection without duplicating recommended tools
        // Recommended tools are shown in the Quick section only
        if (categoryId !== ToolCategoryId.RECOMMENDED_TOOLS) {
          if (!all[subcategoryId]) all[subcategoryId] = [];
          all[subcategoryId].push(...tools);
        }
      });

      if (categoryId === ToolCategoryId.RECOMMENDED_TOOLS) {
        Object.entries(subs).forEach(([s, tools]) => {
          const subcategoryId = s as SubcategoryId;
          if (!quick[subcategoryId]) quick[subcategoryId] = [];
          // Only include ready tools (have a component or external link) in Quick Access
          // Special case: read and multiTool are navigational tools that don't need components
          const readyTools = tools.filter(({ tool, id }) =>
            tool.component !== null || !!tool.link || id === 'read' || id === 'multiTool'
          );
          quick[subcategoryId].push(...readyTools);
        });
      }
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
        .map(([subcategoryId, tools]) => ({ subcategoryId, tools } as SubcategoryGroup));

    const built: ToolSection[] = [
      { key: 'quick', title: t('toolPicker.quickAccess', 'QUICK ACCESS'), subcategories: sortSubs(quick) },
      { key: 'all', title: t('toolPicker.allTools', 'ALL TOOLS'), subcategories: sortSubs(all) }
    ];

    return built.filter(section => section.subcategories.some(sc => sc.tools.length > 0));
  }, [groupedTools]);

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
        .map(([subcategoryId, tools]) => ({ subcategoryId, tools } as SubcategoryGroup));
    }

    // No search: alphabetical subcategory ordering
    return entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subcategoryId, tools]) => ({ subcategoryId, tools } as SubcategoryGroup));
  }, [filteredTools, searchQuery]);

  return { sections, searchGroups };
}


