// Client-side classification entry point: extract the PDF, classify it against
// the rules for whatever language it turns out to be written in.

import i18n from "i18next";
import { classifyHeuristic } from "@app/services/heuristic/heuristicEngine";
import { extractHeuristicDoc } from "@app/services/heuristic/heuristicExtractor";
import type { HeuristicResult } from "@app/services/heuristic/types";

/** Classify a file in the browser. Throws if extraction fails (unreadable / non-PDF). */
export async function classifyFileHeuristically(
  file: File,
  opts?: { explain?: boolean },
): Promise<HeuristicResult> {
  const doc = await extractHeuristicDoc(file, file.name);
  return classifyHeuristic(doc, {
    ...opts,
    // Only consulted for a document whose own text proves no language; the app
    // bootstraps this i18next singleton at startup, so guard for early calls.
    localeHint: i18n.language ?? undefined,
  });
}
