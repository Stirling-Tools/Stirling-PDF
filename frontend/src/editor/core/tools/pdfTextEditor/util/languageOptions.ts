import {
  isOptionsGroup,
  type ComboboxItem,
  type ComboboxParsedItem,
  type OptionsFilter,
} from "@mantine/core";
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

export interface LanguageOptions {
  /** The languages in `inUse`, sorted by label. */
  inUse: LanguageOption[];
  /** Every other language offered, sorted by label. */
  others: LanguageOption[];
}

/**
 * The offered languages, split into those the document uses and the rest,
 * plus `current`, the file's own tag, and the tag `typed` names when either
 * is one the list lacks: any well-formed tag can be picked, not only those
 * listed.
 */
export function languageOptions(
  current: string | null,
  uiLang: string,
  typed = "",
  inUse: readonly string[] = [],
): LanguageOptions {
  const tags = new Set([
    ...OFFERED_LANGUAGE_TAGS,
    ...inUse,
    ...[current, canonicalLanguageTag(searchedCode(typed))].filter(
      (tag): tag is string => tag !== null,
    ),
  ]);
  const sorted = (keep: (tag: string) => boolean) =>
    [...tags]
      .filter(keep)
      .map((tag) => ({ tag, label: optionLabel(tag, uiLang) }))
      .sort((a, b) => a.label.localeCompare(b.label, uiLang));
  return {
    inUse: sorted((tag) => inUse.includes(tag)),
    others: sorted((tag) => !inUse.includes(tag)),
  };
}

/**
 * The options a search shows: those whose label contains it, and those
 * whose tag starts with the code it names, so editing the code in a shown
 * "Spanish (es)" to "Spanish (es-MX)" finds Mexican Spanish.
 */
export const filterLanguages: OptionsFilter = ({ options, search }) => {
  const words = search.trim().toLowerCase();
  const code = searchedCode(search).toLowerCase();
  const matches = ({ value, label }: ComboboxItem) =>
    label.toLowerCase().includes(words) ||
    (code !== "" && value.toLowerCase().startsWith(code));
  return options.flatMap((option): ComboboxParsedItem[] => {
    if (!isOptionsGroup(option)) return matches(option) ? [option] : [];
    const items = option.items.filter(matches);
    return items.length > 0 ? [{ ...option, items }] : [];
  });
};

/**
 * The language code a search names: the one in an option label's
 * parentheses with anything typed after them ("Spanish (es)-MX" -> "es-MX"),
 * else the whole search.
 */
function searchedCode(search: string): string {
  const labelled = /\(([^()]*)\)\s*(\S*)$/.exec(search.trim());
  return labelled ? labelled[1] + labelled[2] : search.trim();
}

function optionLabel(tag: string, uiLang: string): string {
  const name = languageName(tag, uiLang);
  return name === tag ? tag : `${name} (${tag})`;
}
