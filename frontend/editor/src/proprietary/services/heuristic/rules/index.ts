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
  ar: () => import("@app/services/heuristic/rules/packs/ar.json"),
  az: () => import("@app/services/heuristic/rules/packs/az.json"),
  bg: () => import("@app/services/heuristic/rules/packs/bg.json"),
  bo: () => import("@app/services/heuristic/rules/packs/bo.json"),
  ca: () => import("@app/services/heuristic/rules/packs/ca.json"),
  cs: () => import("@app/services/heuristic/rules/packs/cs.json"),
  da: () => import("@app/services/heuristic/rules/packs/da.json"),
  de: () => import("@app/services/heuristic/rules/packs/de.json"),
  el: () => import("@app/services/heuristic/rules/packs/el.json"),
  en: () => import("@app/services/heuristic/rules/packs/en.json"),
  es: () => import("@app/services/heuristic/rules/packs/es.json"),
  eu: () => import("@app/services/heuristic/rules/packs/eu.json"),
  fa: () => import("@app/services/heuristic/rules/packs/fa.json"),
  fr: () => import("@app/services/heuristic/rules/packs/fr.json"),
  ga: () => import("@app/services/heuristic/rules/packs/ga.json"),
  hi: () => import("@app/services/heuristic/rules/packs/hi.json"),
  hr: () => import("@app/services/heuristic/rules/packs/hr.json"),
  hu: () => import("@app/services/heuristic/rules/packs/hu.json"),
  id: () => import("@app/services/heuristic/rules/packs/id.json"),
  it: () => import("@app/services/heuristic/rules/packs/it.json"),
  ja: () => import("@app/services/heuristic/rules/packs/ja.json"),
  ko: () => import("@app/services/heuristic/rules/packs/ko.json"),
  ml: () => import("@app/services/heuristic/rules/packs/ml.json"),
  nl: () => import("@app/services/heuristic/rules/packs/nl.json"),
  no: () => import("@app/services/heuristic/rules/packs/no.json"),
  pl: () => import("@app/services/heuristic/rules/packs/pl.json"),
  pt: () => import("@app/services/heuristic/rules/packs/pt.json"),
  ro: () => import("@app/services/heuristic/rules/packs/ro.json"),
  ru: () => import("@app/services/heuristic/rules/packs/ru.json"),
  sk: () => import("@app/services/heuristic/rules/packs/sk.json"),
  sl: () => import("@app/services/heuristic/rules/packs/sl.json"),
  sr: () => import("@app/services/heuristic/rules/packs/sr.json"),
  sv: () => import("@app/services/heuristic/rules/packs/sv.json"),
  th: () => import("@app/services/heuristic/rules/packs/th.json"),
  tr: () => import("@app/services/heuristic/rules/packs/tr.json"),
  uk: () => import("@app/services/heuristic/rules/packs/uk.json"),
  vi: () => import("@app/services/heuristic/rules/packs/vi.json"),
  zh: () => import("@app/services/heuristic/rules/packs/zh.json"),
};

/** Tags with an authored pack, for tests and diagnostics. */
export const PACK_LANGUAGES: string[] = Object.keys(LANGUAGE_PACKS);

export function hasPack(language: string | null): boolean {
  return language != null && language in LANGUAGE_PACKS;
}
