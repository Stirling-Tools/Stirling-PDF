import { ToolRegistryEntry } from "../data/toolsTaxonomy";
import { idToWords, scoreMatch, minScoreForQuery } from "./fuzzySearch";

export interface RankedToolItem {
  item: [string, ToolRegistryEntry];
  matchedText?: string;
}

export function filterToolRegistryByQuery(
  toolRegistry: Record<string, ToolRegistryEntry>,
  query: string
): RankedToolItem[] {
  const entries = Object.entries(toolRegistry);
  if (!query.trim()) {
    return entries.map(([id, tool]) => ({ item: [id, tool] as [string, ToolRegistryEntry] }));
  }

  const threshold = minScoreForQuery(query);
  const results: Array<{ item: [string, ToolRegistryEntry]; matchedText?: string; score: number }> = [];

  for (const [id, tool] of entries) {
    let best = 0;
    let matchedText = '';

    const candidates: string[] = [
      idToWords(id),
      tool.name || '',
      tool.description || ''
    ];
    for (const value of candidates) {
      if (!value) continue;
      const s = scoreMatch(query, value);
      if (s > best) {
        best = s;
        matchedText = value;
      }
      if (best >= 95) break;
    }

    if (Array.isArray(tool.synonyms)) {
      for (const synonym of tool.synonyms) {
        if (!synonym) continue;
        const s = scoreMatch(query, synonym);
        if (s > best) {
          best = s;
          matchedText = synonym;
        }
        if (best >= 95) break;
      }
    }

    if (best >= threshold) {
      results.push({ item: [id, tool] as [string, ToolRegistryEntry], matchedText, score: best });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.map(({ item, matchedText }) => ({ item, matchedText }));
}


