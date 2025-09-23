import { useMemo } from 'react';

import { SUBCATEGORY_ORDER, SubcategoryId, ToolCategoryId, ToolRegistryEntry } from '../data/toolsTaxonomy';
import { idToWords, normalizeForSearch } from '../utils/fuzzySearch';
import { useTranslation } from 'react-i18next';

type SubcategoryIdMap = {
  [subcategoryId in SubcategoryId]: Array<{ id: string /* FIX ME: Should be ToolId */; tool: ToolRegistryEntry }>;
}

type GroupedTools = {
  [categoryId in ToolCategoryId]: SubcategoryIdMap;
};

export interface SubcategoryGroup {
  subcategoryId: SubcategoryId;
  tools: {
    id: string /* FIX ME: Should be ToolId */;
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
  filteredTools: Array<{ item: [string /* FIX ME: Should be ToolId */, ToolRegistryEntry]; matchedText?: string }>,
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
        if (!all[subcategoryId]) all[subcategoryId] = [];
        all[subcategoryId].push(...tools);
      });

      if (categoryId === ToolCategoryId.RECOMMENDED_TOOLS) {
        Object.entries(subs).forEach(([s, tools]) => {
          const subcategoryId = s as SubcategoryId;
          if (!quick[subcategoryId]) quick[subcategoryId] = [];
          // Only include ready tools (have a component or external link) in Quick Access
          const readyTools = tools.filter(({ tool }) => tool.component !== null || !!tool.link);
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
    const seen = new Set<string /* FIX ME: Should be ToolId */>();
    filteredTools.forEach(({ item: [id, tool] }) => {
      const toolId = id as string /* FIX ME: Should be ToolId */;
      if (seen.has(toolId)) return;
      seen.add(toolId);
      const sub = tool.subcategoryId;
      if (!subMap[sub]) subMap[sub] = [];
      subMap[sub].push({ id: toolId, tool });
    });
    const entries = Object.entries(subMap);

    // If a search query is provided, and there are no exact/substring matches across any field,
    // preserve the encounter order of subcategories (best matches first) instead of alphabetical.
    if (searchQuery && searchQuery.trim()) {
      const nq = normalizeForSearch(searchQuery);
      const hasExact = filteredTools.some(({ item: [id, tool] }) => {
        const idWords = idToWords(id);
        return (
          idWords.includes(nq) ||
          normalizeForSearch(tool.name).includes(nq) ||
          normalizeForSearch(tool.description).includes(nq)
        );
      });
      if (!hasExact) {
        // Keep original appearance order of subcategories as they occur in filteredTools
        const order: SubcategoryId[] = [];
        filteredTools.forEach(({ item: [_, tool] }) => {
          const sc = tool.subcategoryId;
          if (!order.includes(sc)) order.push(sc);
        });
        return entries
          .sort(([a], [b]) => order.indexOf(a as SubcategoryId) - order.indexOf(b as SubcategoryId))
          .map(([subcategoryId, tools]) => ({ subcategoryId, tools } as SubcategoryGroup));
      }
    }

    return entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subcategoryId, tools]) => ({ subcategoryId, tools } as SubcategoryGroup));
  }, [filteredTools, searchQuery]);

  return { sections, searchGroups };
}


