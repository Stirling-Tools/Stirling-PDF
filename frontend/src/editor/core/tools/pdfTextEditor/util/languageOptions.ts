import { canonicalLanguageTag } from "@editor/tools/pdfTextEditor/model/languageTag";
import { getAllLanguageDefinitions } from "@editor/utils/languageMapping";

/**
 * Regional variants offered beside each language's own tag: only those that
 * change how text is read. RFC 5646 4.1 advises a region only then, and a
 * screen reader picks its voice by the language.
 */
const REGIONAL_TAGS: readonly string[] = [
  "en-AU",
  "en-CA",
  "en-GB",
  "en-IE",
  "en-NZ",
  "en-US",
  "en-ZA",
  "es-ES",
  "es-MX",
  "fr-BE",
  "fr-CA",
  "fr-CH",
  "de-AT",
  "de-CH",
  "pt-BR",
  "pt-PT",
  "zh-Hans",
  "zh-Hant",
];

/**
 * The languages offered for text, as BCP 47 tags: every language the app
 * can OCR, by its own tag, plus REGIONAL_TAGS. Shared with OCR so the app has
 * one list of the languages it supports.
 */
export const OFFERED_LANGUAGE_TAGS: readonly string[] = [
  ...new Set([
    ...getAllLanguageDefinitions().flatMap(({ browserCodes }) =>
      browserCodes.length > 0 ? [browserCodes[0]] : [],
    ),
    ...REGIONAL_TAGS,
  ]),
];

/** The tag's name in `uiLang` ("French", "English (Ireland)"); the tag itself where the browser has none. */
export function languageName(tag: string, uiLang: string): string {
  try {
    return new Intl.DisplayNames([uiLang], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

export interface LanguageOption {
  tag: string;
  label: string;
}

/**
 * The offered languages sorted by name in `uiLang`, plus `current`, the
 * file's own tag, and `typed`, text being searched for, when either is a tag
 * the list lacks: any well-formed tag can be picked, not only those listed.
 */
export function languageOptions(
  current: string | null,
  uiLang: string,
  typed = "",
): LanguageOption[] {
  const extra = [current, canonicalLanguageTag(typed)].filter(
    (tag): tag is string =>
      tag !== null && !OFFERED_LANGUAGE_TAGS.includes(tag),
  );
  return [...new Set([...OFFERED_LANGUAGE_TAGS, ...extra])]
    .map((tag) => ({ tag, label: optionLabel(tag, uiLang) }))
    .sort((a, b) => a.label.localeCompare(b.label, uiLang));
}

function optionLabel(tag: string, uiLang: string): string {
  const name = languageName(tag, uiLang);
  return name === tag ? tag : `${name} (${tag})`;
}
