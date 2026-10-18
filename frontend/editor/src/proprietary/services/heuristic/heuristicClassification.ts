// Client-side classification entry point: extract the PDF, then classify it.

import i18n from "i18next";
import { classifyHeuristic } from "@app/services/heuristic/heuristicEngine";
import {
  extractHeuristicDoc,
  type ExtractOptions,
} from "@app/services/heuristic/heuristicExtractor";
import type { HeuristicResult } from "@app/services/heuristic/types";

/** Classify a file in the browser. Throws if extraction fails: unreadable, non-PDF, or a
 *  `budgetMs` that runs out before any text is read. */
export async function classifyFileHeuristically(
  file: File,
  opts?: { explain?: boolean } & ExtractOptions,
): Promise<HeuristicResult> {
  const doc = await extractHeuristicDoc(file, file.name, {
    budgetMs: opts?.budgetMs,
  });
  return classifyHeuristic(doc, {
    explain: opts?.explain,
    localeHint: i18n.language ?? undefined,
  });
}
