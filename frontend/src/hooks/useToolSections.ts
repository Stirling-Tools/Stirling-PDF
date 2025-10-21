import { useMemo } from 'react';

import { SUBCATEGORY_ORDER, SubcategoryId, ToolCategoryId, ToolRegistryEntry } from '../data/toolsTaxonomy';
import { useTranslation } from 'react-i18next';
import { ToolId } from 'src/types/toolId';

type SubcategoryIdMap<T extends ToolId> = {
  [subcategoryId in SubcategoryId]: Array<{ id: T; tool: ToolRegistryEntry }>;
}

type GroupedTools<T extends ToolId> = {
  [categoryId in ToolCategoryId]: SubcategoryIdMap<T>;
};

export interface SubcategoryGroup<T extends ToolId = ToolId> {
  subcategoryId: SubcategoryId;
  tools: {
    id: T;
    tool: ToolRegistryEntry;
  }[];
};

export type ToolSectionKey = 'quick' | 'all';

export interface ToolSection<T extends ToolId = ToolId> {
  key: ToolSectionKey;
  title: string;
  subcategories: SubcategoryGroup<T>[];
};

export function useToolSections<T extends ToolId = ToolId>(
  filteredTools: Array<{ item: [T, ToolRegistryEntry]; matchedText?: string }>,
  searchQuery?: string
) {
  const { t } = useTranslation();

  const groupedTools = useMemo(() => {
    if (!filteredTools || !Array.isArray(filteredTools)) {
      return {} as GroupedTools<T>;
    }

    const grouped = {} as GroupedTools<T>;
    filteredTools.forEach(({ item: [id, tool] }) => {
      const categoryId = tool.categoryId;
      const subcategoryId = tool.subcategoryId;
      if (!grouped[categoryId]) grouped[categoryId] = {} as SubcategoryIdMap<T>;
      if (!grouped[categoryId][subcategoryId]) grouped[categoryId][subcategoryId] = [];
      grouped[categoryId][subcategoryId].push({ id, tool });
    });
    return grouped;
  }, [filteredTools]);

  const sections: ToolSection<T>[] = useMemo(() => {
    const getOrderIndex = (id: SubcategoryId) => {
      const idx = SUBCATEGORY_ORDER.indexOf(id);
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };

    const quick = {} as SubcategoryIdMap<T>;
    const all = {} as SubcategoryIdMap<T>;

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
          // Special case: read and multiTool are navigational tools that don't need components
          const readyTools = tools.filter(({ tool, id }) =>
            tool.component !== null || !!tool.link || id === 'read' || id === 'multiTool'
          );
          quick[subcategoryId].push(...readyTools);
        });
      }
    });

    const sortSubs = (obj: SubcategoryIdMap<T>) =>
      Object.entries(obj)
        .sort(([a], [b]) => {
          const aId = a as SubcategoryId;
          const bId = b as SubcategoryId;
          const ai = getOrderIndex(aId);
          const bi = getOrderIndex(bId);
          if (ai !== bi) return ai - bi;
          return aId.localeCompare(bId);
        })
        .map(([subcategoryId, tools]) => ({ subcategoryId, tools } as SubcategoryGroup<T>));

    const built: ToolSection<T>[] = [
      { key: 'quick', title: t('toolPicker.quickAccess', 'QUICK ACCESS'), subcategories: sortSubs(quick) },
      { key: 'all', title: t('toolPicker.allTools', 'ALL TOOLS'), subcategories: sortSubs(all) }
    ];

    return built.filter(section => section.subcategories.some(sc => sc.tools.length > 0));
  }, [groupedTools]);

  const searchGroups: SubcategoryGroup<T>[] = useMemo(() => {
    if (!filteredTools || !Array.isArray(filteredTools)) {
      return [];
    }

    const subMap = {} as SubcategoryIdMap<T>;
    const seen = new Set<T>();
    filteredTools.forEach(({ item: [id, tool] }) => {
      const toolId = id;
      if (seen.has(toolId)) return;
      seen.add(toolId);
      const sub = tool.subcategoryId;
      if (!subMap[sub]) subMap[sub] = [];
      subMap[sub].push({ id: toolId, tool });
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
        .map(([subcategoryId, tools]) => ({ subcategoryId, tools } as SubcategoryGroup<T>));
    }

    // No search: alphabetical subcategory ordering
    return entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subcategoryId, tools]) => ({ subcategoryId, tools } as SubcategoryGroup<T>));
  }, [filteredTools, searchQuery]);

  return { sections, searchGroups };
}
