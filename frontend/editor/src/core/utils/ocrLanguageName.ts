/** Tesseract model suffixes that name a script, as the BCP 47 subtag for it. */
const SCRIPT_SUFFIXES: Record<string, string> = {
  sim: "Hans",
  tra: "Hant",
  latn: "Latn",
  cyrl: "Cyrl",
};

/**
 * A Tesseract language code (`spa`, `chi_sim`, `spa_old`) named in `locale`, capitalised for a
 * list. Null when the platform has no name for it (`osd`, `equ`), so the caller can fall back to
 * the catalogue's own name.
 *
 * @param old wraps the name of a historic model (`spa_old`), which the platform cannot express
 */
export function ocrLanguageName(
  code: string,
  locale: string,
  old: (name: string) => string,
): string | null {
  const [language, ...variants] = code.split("_");
  const script = variants
    .map((variant) => SCRIPT_SUFFIXES[variant])
    .find(Boolean);
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames([locale], {
      type: "language",
      fallback: "none",
    }).of(script ? `${language}-${script}` : language);
  } catch {
    return null;
  }
  if (!name) return null;
  const listed = name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  const rest = variants.filter(
    (variant) => variant !== "old" && !SCRIPT_SUFFIXES[variant],
  );
  const named = rest.length > 0 ? `${listed} (${rest.join(", ")})` : listed;
  return variants.includes("old") ? old(named) : named;
}
