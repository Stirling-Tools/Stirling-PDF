// Client-side classification entry point: load rules, extract the PDF, classify.

import {
  ensureRulesLoaded,
  classifyHeuristic,
} from "@editor/services/heuristic/heuristicEngine";
import { extractHeuristicDoc } from "@editor/services/heuristic/heuristicExtractor";
import type { HeuristicResult } from "@editor/services/heuristic/types";

/** Classify a file in the browser. Throws if extraction fails (unreadable / non-PDF). */
export async function classifyFileHeuristically(
  file: File,
  opts?: { explain?: boolean },
): Promise<HeuristicResult> {
  await ensureRulesLoaded();
  const doc = await extractHeuristicDoc(file, file.name);
  return classifyHeuristic(doc, opts);
}
