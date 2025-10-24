import { ToolId } from "@app/types/toolId";
import { ToolRegistryEntry, ToolRegistry } from "@app/data/toolsTaxonomy";
import { scoreMatch, minScoreForQuery, normalizeForSearch } from "@app/utils/fuzzySearch";

export interface RankedToolItem {
  item: [ToolId, ToolRegistryEntry];
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

  if (ordered.length > 0) return ordered;

  // Fallback: return everything unchanged
  return entries.map(([id, tool]) => ({ item: [id, tool] as [ToolId, ToolRegistryEntry] }));
}

