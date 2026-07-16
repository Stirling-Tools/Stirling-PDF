// Client-side classification entry point: load the rules, extract the PDF, run the heuristic engine.
// Used by useClientSideClassification when the AI engine is off. Rejects if the PDF can't be read.

import {
  ensureRulesLoaded,
  classifyHeuristic,
} from "@app/services/heuristic/heuristicEngine";
import { extractHeuristicDoc } from "@app/services/heuristic/heuristicExtractor";
import type { HeuristicResult } from "@app/services/heuristic/types";

/** Classify a file in the browser. Throws if extraction fails (unreadable / non-PDF). */
export async function classifyFileHeuristically(
  file: File,
  opts?: { explain?: boolean },
): Promise<HeuristicResult> {
  await ensureRulesLoaded();
  const doc = await extractHeuristicDoc(file, file.name);
  return classifyHeuristic(doc, opts);
}
