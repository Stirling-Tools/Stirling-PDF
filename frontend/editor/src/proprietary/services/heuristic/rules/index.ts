// Registry of the classifier's rule data. The core set and every language pack
// are separate lazy chunks: a document is scored against core plus the pack(s)
// for the language it is written in, so adding a language costs existing users
// nothing at runtime.
//
// To add a language: drop `packs/<tag>.json` beside the others, add one line to
// LANGUAGE_PACKS, and add a profile to `languages.json` if the detector cannot
// already name it. Nothing in heuristicEngine.ts needs to change.
// Authoring guide: `rules/README.md`.

/** Rule sets shared by every language — label ids, priors, and wordless rules. */
export const loadCoreRules = () =>
  import("@app/services/heuristic/rules/core.json");

/**
 * Language tag → pack loader. Keys are the tags `detectLanguage` produces
 * (ISO 639-1, region-free: one pack serves pt-BR and pt-PT alike).
 */
export const LANGUAGE_PACKS: Record<string, () => Promise<unknown>> = {
  en: () => import("@app/services/heuristic/rules/packs/en.json"),
  de: () => import("@app/services/heuristic/rules/packs/de.json"),
};

/** Tags with an authored pack, for tests and diagnostics. */
export const PACK_LANGUAGES: string[] = Object.keys(LANGUAGE_PACKS);

export function hasPack(language: string | null): boolean {
  return language != null && language in LANGUAGE_PACKS;
}
