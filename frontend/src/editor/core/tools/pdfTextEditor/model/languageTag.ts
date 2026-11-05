/**
 * Natural-language tags as /Lang holds them (ISO 32000-1 14.9.2): BCP 47
 * (RFC 5646), the tag a screen reader picks its voice and pronunciation by.
 */

// The syntax PDF/UA validators check every /Lang against (veraPDF PDF/UA-1
// rule 7.2-29, PDF/UA-2 8.4.4-2). It admits "" no more than a reader does.
const LANG_SYNTAX = /^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*$/;

/**
 * The tag in canonical form ("EN-ie" -> "en-IE"), or null when it is not a
 * well-formed BCP 47 tag. Well-formed only: a registered but unlikely tag
 * such as "en-FR" passes.
 */
export function canonicalLanguageTag(tag: string): string | null {
  const trimmed = tag.trim();
  if (!LANG_SYNTAX.test(trimmed)) return null;
  try {
    return Intl.getCanonicalLocales(trimmed)[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * The tag in canonical form, or as given when it is not well-formed, so two
 * spellings of one tag compare equal while a malformed one is kept to show.
 */
export function comparableLanguageTag(tag: string): string {
  return canonicalLanguageTag(tag) ?? tag;
}

/** The language text is read in, and where that comes from. */
export interface TextLanguage {
  /** The tag set on the element itself, as the session has it; null when it sets none. */
  own: string | null;
  /** What the text is read in without `own`: an ancestor's tag, else the document's; null when unknown. */
  inherited: string | null;
}

/** The tag text is read in: its own, else the one it inherits; null when unknown. */
export function effectiveLanguage(language: TextLanguage): string | null {
  return language.own ?? language.inherited;
}
