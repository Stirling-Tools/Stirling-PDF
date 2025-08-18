import { useMemo } from 'react';

import { SUBCATEGORY_ORDER, ToolCategory, ToolRegistryEntry } from '../data/toolsTaxonomy';
import { useTranslation } from 'react-i18next';

type GroupedTools = {
  [category: string]: {
    [subcategory: string]: Array<{ id: string; tool: ToolRegistryEntry }>;
  };
};

export function useToolSections(filteredTools: [string, ToolRegistryEntry][]) {
  const { t } = useTranslation();

  const groupedTools = useMemo(() => {
    const grouped: GroupedTools = {};
    filteredTools.forEach(([id, tool]) => {
      const category = tool.category;
      const subcategory = tool.subcategory;
      if (!grouped[category]) grouped[category] = {};
      if (!grouped[category][subcategory]) grouped[category][subcategory] = [];
      grouped[category][subcategory].push({ id, tool });
    });
    return grouped;
  }, [filteredTools]);

  const sections = useMemo(() => {
    const getOrderIndex = (name: string) => {
      const idx = SUBCATEGORY_ORDER.indexOf(name as any);
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
    };

    const quick: Record<string, Array<{ id: string; tool: ToolRegistryEntry }>> = {};
    const all: Record<string, Array<{ id: string; tool: ToolRegistryEntry }>> = {};

    Object.entries(groupedTools).forEach(([origCat, subs]) => {
      const upperCat = origCat.toUpperCase();

      Object.entries(subs).forEach(([sub, tools]) => {
        if (!all[sub]) all[sub] = [];
        all[sub].push(...tools);
      });

      if (upperCat === ToolCategory.RECOMMENDED_TOOLS.toUpperCase()) {
        Object.entries(subs).forEach(([sub, tools]) => {
          if (!quick[sub]) quick[sub] = [];
          quick[sub].push(...tools);
        });
      }
    });

    const sortSubs = (obj: Record<string, Array<{ id: string; tool: ToolRegistryEntry }>>) =>
      Object.entries(obj)
        .sort(([a], [b]) => {
          const ai = getOrderIndex(a);
          const bi = getOrderIndex(b);
          if (ai !== bi) return ai - bi;
          return a.localeCompare(b);
        })
        .map(([subcategory, tools]) => ({ subcategory, tools }));

    const built = [
      { key: 'quick', title: t('toolPicker.quickAccess', 'QUICK ACCESS'), subcategories: sortSubs(quick) },
      { key: 'all', title: t('toolPicker.allTools', 'ALL TOOLS'), subcategories: sortSubs(all) }
    ];

    return built.filter(section => section.subcategories.some(sc => sc.tools.length > 0));
  }, [groupedTools]);

  const searchGroups = useMemo(() => {
    const subMap: Record<string, Array<{ id: string; tool: ToolRegistryEntry }>> = {};
    const seen = new Set<string>();
    filteredTools.forEach(([id, tool]) => {
      if (seen.has(id)) return;
      seen.add(id);
      const sub = tool.subcategory;
      if (!subMap[sub]) subMap[sub] = [];
      subMap[sub].push({ id, tool });
    });
    return Object.entries(subMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subcategory, tools]) => ({ subcategory, tools }));
  }, [filteredTools]);

  return { sections, searchGroups };
}


