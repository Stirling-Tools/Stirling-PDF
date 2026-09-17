// Client-side classification entry point: load rules, extract the PDF, classify.

import {
  ensureRulesLoaded,
  classifyHeuristic,
} from "@app/services/heuristic/heuristicEngine";
import {
  extractHeuristicDoc,
  type ExtractOptions,
} from "@app/services/heuristic/heuristicExtractor";
import type { HeuristicResult } from "@app/services/heuristic/types";

/** Classify a file in the browser. Throws if extraction fails (unreadable / non-PDF);
 *  a `budgetMs` that runs out yields a name-only verdict rather than throwing. */
export async function classifyFileHeuristically(
  file: File,
  opts?: { explain?: boolean } & ExtractOptions,
): Promise<HeuristicResult> {
  await ensureRulesLoaded();
  const doc = await extractHeuristicDoc(file, file.name, {
    budgetMs: opts?.budgetMs,
  });
  return classifyHeuristic(doc, opts);
}
