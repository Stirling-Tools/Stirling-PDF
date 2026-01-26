import { TFunction } from 'i18next';
import { ToolId } from "@app/types/toolId";
import { ToolRegistryEntry, ToolRegistry } from "@app/data/toolsTaxonomy";
import { SubToolEntry } from "@app/types/subtool";
import { scoreMatch, minScoreForQuery, normalizeForSearch } from "@app/utils/fuzzySearch";
import { toolSupportsSubTools, generateSubToolsForTool } from "@app/utils/subToolExpansion";

export interface RankedToolItem {
  item: [ToolId, ToolRegistryEntry];
  matchedText?: string;
}

export interface RankedSearchItem {
  type: 'parent' | 'subtool';
  item: [ToolId | string, ToolRegistryEntry | SubToolEntry];
  matchedText?: string;
}

export function filterToolRegistryByQuery(
  toolRegistry: Partial<ToolRegistry>,
  query: string
): RankedToolItem[] {
  const entries = Object.entries(toolRegistry) as [ToolId, ToolRegistryEntry][];
  if (!query.trim()) {
    return entries.map(([id, tool]) => ({ item: [id, tool] as [ToolId, ToolRegistryEntry] }));
  }

  const nq = normalizeForSearch(query);
  const threshold = minScoreForQuery(query);

  const exactName: Array<{ id: ToolId; tool: ToolRegistryEntry; pos: number }> = [];
  const exactSyn: Array<{ id: ToolId; tool: ToolRegistryEntry; text: string; pos: number }> = [];
  const fuzzyName: Array<{ id: ToolId; tool: ToolRegistryEntry; score: number; text: string }> = [];
  const fuzzySyn: Array<{ id: ToolId; tool: ToolRegistryEntry; score: number; text: string }> = [];

  for (const [id, tool] of entries) {
    const nameNorm = normalizeForSearch(tool.name || '');
    const pos = nameNorm.indexOf(nq);
    if (pos !== -1) {
      exactName.push({ id, tool, pos });
      continue;
    }

    const syns = Array.isArray(tool.synonyms) ? tool.synonyms : [];
    let matchedExactSyn: { text: string; pos: number } | null = null;
    for (const s of syns) {
      const sn = normalizeForSearch(s);
      const sp = sn.indexOf(nq);
      if (sp !== -1) {
        matchedExactSyn = { text: s, pos: sp };
        break;
      }
    }
    if (matchedExactSyn) {
      exactSyn.push({ id, tool, text: matchedExactSyn.text, pos: matchedExactSyn.pos });
      continue;
    }

    // Fuzzy name
    const nameScore = scoreMatch(query, tool.name || '');
    if (nameScore >= threshold) {
      fuzzyName.push({ id, tool, score: nameScore, text: tool.name || '' });
    }

    // Fuzzy synonyms (we'll consider these only if fuzzy name results are weak)
    let bestSynScore = 0;
    let bestSynText = '';
    for (const s of syns) {
      const synScore = scoreMatch(query, s);
      if (synScore > bestSynScore) {
        bestSynScore = synScore;
        bestSynText = s;
      }
      if (bestSynScore >= 95) break;
    }
    if (bestSynScore >= threshold) {
      fuzzySyn.push({ id, tool, score: bestSynScore, text: bestSynText });
    }
  }

  // Sort within buckets
  exactName.sort((a, b) => a.pos - b.pos || (a.tool.name || '').length - (b.tool.name || '').length);
  exactSyn.sort((a, b) => a.pos - b.pos || a.text.length - b.text.length);
  fuzzyName.sort((a, b) => b.score - a.score);
  fuzzySyn.sort((a, b) => b.score - a.score);

  // Concatenate buckets with de-duplication by tool id
  const seen = new Set<string>();
  const ordered: RankedToolItem[] = [];

  const push = (id: ToolId, tool: ToolRegistryEntry, matchedText?: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push({ item: [id, tool], matchedText });
  };

  for (const { id, tool } of exactName) push(id as ToolId, tool, tool.name);
  for (const { id, tool, text } of exactSyn) push(id as ToolId, tool, text);
  for (const { id, tool, text } of fuzzyName) push(id as ToolId, tool, text);
  for (const { id, tool, text } of fuzzySyn) push(id as ToolId, tool, text);

  // No matches for a non-empty query -> return empty to avoid noisy fallbacks
  if (ordered.length > 0) return ordered;
  return [];
}

/**
 * Enhanced search function that includes sub-tools in results.
 * Sub-tools are dynamically generated and filtered based on query specificity.
 *
 * @param toolRegistry Registry of tools to search
 * @param query Search query string
 * @param t Translation function for generating sub-tool names
 * @param endpointAvailability Optional map of endpoint name -> enabled status
 * @returns Array of ranked search items (parent tools and sub-tools)
 */
export function filterToolRegistryWithSubTools(
  toolRegistry: Partial<ToolRegistry>,
  query: string,
  t: TFunction,
  endpointAvailability?: Record<string, boolean>,
  endpointAvailabilityLoading?: boolean
): RankedSearchItem[] {
  const trimmedQuery = query.trim();
  const nq = normalizeForSearch(trimmedQuery);
  const threshold = minScoreForQuery(trimmedQuery);

  // For empty queries, return parent tools only (no sub-tools)
  if (!trimmedQuery) {
    return filterToolRegistryByQuery(toolRegistry, query).map(result => ({
      type: 'parent' as const,
      item: result.item,
      matchedText: result.matchedText
    }));
  }

  // Step 1: Perform normal tool search
  const normalResults = filterToolRegistryByQuery(toolRegistry, query);

  // Check if this is an exact substring match in the query
  const isExactMatch = (tool: ToolRegistryEntry): boolean => {
    const nameNorm = normalizeForSearch(tool.name || '');
    if (nameNorm.includes(nq)) return true;

    const syns = Array.isArray(tool.synonyms) ? tool.synonyms : [];
    return syns.some(s => normalizeForSearch(s).includes(nq));
  };

  // Step 2: Expand sub-tools for tools that matched parent search
  const expandedResults: RankedSearchItem[] = [];
  const processedToolIds = new Set<string>();

  const scoreSubTool = (subTool: SubToolEntry): number => {
    const scores: number[] = [
      scoreMatch(query, subTool.name || ''),
      scoreMatch(query, subTool.description || '')
    ];

    for (const term of subTool.searchTerms || []) {
      scores.push(scoreMatch(query, term));
      const termNorm = normalizeForSearch(term);
      if (termNorm.includes(nq) || nq.includes(termNorm)) {
        scores.push(100);
      }
    }

    return Math.max(...scores.filter(s => Number.isFinite(s)));
  };

  const findMatchingSubTools = (subTools: SubToolEntry[]) => {
    // Check if query specifies a specific conversion (e.g., "pdf to png", "from docx to pdf")
    const conversionPattern = query.match(/(?:from\s+)?(\w+)\s+to\s+(\w+)/i);
    const fromFormat = conversionPattern ? conversionPattern[1].toLowerCase() : null;
    const toFormat = conversionPattern ? conversionPattern[2].toLowerCase() : null;
    const fromOnlyMatch = query.match(/\bfrom\s+(\w+)/i);
    const fromOnlyFormat = fromOnlyMatch ? fromOnlyMatch[1].toLowerCase() : null;

    let scored: Array<{ subTool: SubToolEntry; score: number }> = [];

    if (fromFormat && toFormat) {
      scored = subTools
        .filter(subTool => {
          const subToolId = subTool.id.toLowerCase();
          const match = subToolId.match(/convert:(\w+)-to-(\w+)/);
          if (!match) return false;

          const subFrom = match[1];
          const subTo = match[2];

          return subFrom.startsWith(fromFormat) && subTo.startsWith(toFormat);
        })
        .map(subTool => ({ subTool, score: scoreSubTool(subTool) }))
        .filter(({ score }) => score >= threshold);
    } else {
      scored = subTools
        .map(subTool => {
          const baseScore = scoreSubTool(subTool);
          let bonus = 0;

          if (fromOnlyFormat) {
            const subToolId = subTool.id.toLowerCase();
            const match = subToolId.match(/convert:(\w+)-to-(\w+)/);
            if (match) {
              const subFrom = match[1];
              if (subFrom.startsWith(fromOnlyFormat)) {
                bonus = 15; // Nudge matching "from" format higher when no "to" specified
              }
            }
          }

          return { subTool, score: baseScore + bonus };
        })
        .filter(({ score }) => score >= threshold);

      const toOnlyMatch = query.match(/\bto\s+(\w+)/i);
      const toOnlyFormat = toOnlyMatch ? toOnlyMatch[1].toLowerCase() : null;
      if (toOnlyFormat) {
        scored = scored.sort((a, b) => {
          const aIsToFormat = a.subTool.id.toLowerCase().endsWith(`-to-${toOnlyFormat}`);
          const bIsToFormat = b.subTool.id.toLowerCase().endsWith(`-to-${toOnlyFormat}`);
          if (aIsToFormat && !bIsToFormat) return -1;
          if (!aIsToFormat && bIsToFormat) return 1;
          return b.score - a.score;
        });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Limit results to avoid overwhelming UI
    const limited = scored.slice(0, 15);

    return limited;
  };

  for (const result of normalResults) {
    const [toolId, tool] = result.item;
    processedToolIds.add(toolId);

    const hasExactMatch = isExactMatch(tool);

    // Check if this tool supports sub-tools
    if (!toolSupportsSubTools(toolId as ToolId)) {
      // No sub-tools - keep the fuzzy ordering from normalResults
      expandedResults.push({
        type: 'parent',
        item: result.item,
        matchedText: result.matchedText
      });
      continue;
    }

    // Generate sub-tools dynamically
    const subTools = generateSubToolsForTool(toolId as ToolId, tool, t, endpointAvailability, endpointAvailabilityLoading);

    const matchingSubTools = findMatchingSubTools(subTools);

    // If no sub-tools match and no exact match, skip this tool
    // UNLESS this tool matched in the initial search (was in normalResults)
    if (matchingSubTools.length === 0 && !hasExactMatch) {
      // Tool matched parent search, so show it even without matching sub-tools
      expandedResults.push({
        type: 'parent',
        item: result.item,
        matchedText: result.matchedText
      });
      continue;
    }

    // Add parent tool
    expandedResults.push({
      type: 'parent',
      item: result.item,
      matchedText: result.matchedText
    });

    // Add matching sub-tools if any
    if (matchingSubTools.length > 0) {
      for (const { subTool } of matchingSubTools) {
        expandedResults.push({
          type: 'subtool',
          item: [subTool.id, subTool],
          matchedText: subTool.name
        });
      }
    }
  }

  // Step 3: Check tools that didn't match parent search but might have matching sub-tools
  const allEntries = Object.entries(toolRegistry) as [ToolId, ToolRegistryEntry][];
  for (const [toolId, tool] of allEntries) {
    // Skip if already processed or doesn't support sub-tools
    if (processedToolIds.has(toolId) || !toolSupportsSubTools(toolId)) {
      continue;
    }

    // Generate sub-tools dynamically
    const subTools = generateSubToolsForTool(toolId, tool, t, endpointAvailability, endpointAvailabilityLoading);
    const matchingSubTools = findMatchingSubTools(subTools);

    // Only include if sub-tools match
    if (matchingSubTools.length > 0) {
      // Add parent first
      expandedResults.push({
        type: 'parent',
        item: [toolId, tool],
        matchedText: undefined
      });

      // Limit sub-tools to avoid overwhelming results
      // Add matching sub-tools
      for (const { subTool } of matchingSubTools) {
        expandedResults.push({
          type: 'subtool',
          item: [subTool.id, subTool],
          matchedText: subTool.name
        });
      }
    }
  }

  return expandedResults;
}
