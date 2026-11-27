import {
  presetIdOfPattern,
  presetPatterns,
  type RedactPresetId,
} from "@editor/data/redactPresets";

/**
 * Maps the stored word list (what saved automations and the endpoint see) to
 * the picker's view of it: preset types plus custom words. Presets are regexes,
 * so selecting one turns Use Regex on for the whole list; custom words that were
 * plain text are stored escaped from then on and shown unescaped.
 */
export interface RedactWords {
  wordsToRedact: string[];
  useRegex: boolean;
}

const REGEX_SYNTAX = /[\\^$.*+?()[\]{}|]/g;
const ESCAPED_LITERAL = /^(?:[^\\^$.*+?()[\]{}|]|\\[\\^$.*+?()[\]{}|])*$/;

/** Escapes a plain word so a Java or JS regex matches it literally. */
export function escapeRegexLiteral(word: string): string {
  return word.replace(REGEX_SYNTAX, "\\$&");
}

/** The plain word an escaped literal stands for, or null when it is a real regex. */
export function unescapeRegexLiteral(word: string): string | null {
  return ESCAPED_LITERAL.test(word) ? word.replace(/\\(.)/g, "$1") : null;
}

/** A preset pattern matched literally (Use Regex off) is just text, not a preset. */
function isPresetWord(word: string, { useRegex }: RedactWords): boolean {
  return useRegex && presetIdOfPattern(word) !== undefined;
}

export function selectedPresetIds(words: RedactWords): RedactPresetId[] {
  if (!words.useRegex) return [];
  const ids = words.wordsToRedact
    .map(presetIdOfPattern)
    .filter((id) => id !== undefined);
  return [...new Set(ids)];
}

function storedCustomWords(words: RedactWords): string[] {
  return words.wordsToRedact.filter((w) => !isPresetWord(w, words));
}

/** Custom words as the user typed them. */
export function customWordsForDisplay(words: RedactWords): string[] {
  const custom = storedCustomWords(words);
  if (selectedPresetIds(words).length === 0) return custom;
  return custom.map((w) => unescapeRegexLiteral(w) ?? w);
}

/**
 * Clearing the last preset hands Use Regex back to the user: plain again when
 * every custom word was an escaped literal, otherwise left on so real regexes
 * keep working.
 */
export function withPresets(
  words: RedactWords,
  ids: readonly RedactPresetId[],
): RedactWords {
  const custom = storedCustomWords(words);
  if (ids.length > 0) {
    return {
      wordsToRedact: [
        ...presetPatterns(ids),
        ...(words.useRegex ? custom : custom.map(escapeRegexLiteral)),
      ],
      useRegex: true,
    };
  }
  if (selectedPresetIds(words).length === 0) return words;
  const literals = custom.map(unescapeRegexLiteral);
  if (literals.every((w) => w !== null)) {
    return { wordsToRedact: literals, useRegex: false };
  }
  return { wordsToRedact: custom, useRegex: true };
}

export function withCustomWordAdded(
  words: RedactWords,
  word: string,
): RedactWords {
  const stored =
    selectedPresetIds(words).length > 0 ? escapeRegexLiteral(word) : word;
  return { ...words, wordsToRedact: [...words.wordsToRedact, stored] };
}

/** `index` counts custom words only, as {@link customWordsForDisplay} lists them. */
export function withCustomWordRemoved(
  words: RedactWords,
  index: number,
): RedactWords {
  const positions = words.wordsToRedact.flatMap((w, i) =>
    isPresetWord(w, words) ? [] : [i],
  );
  const target = positions[index];
  return {
    ...words,
    wordsToRedact: words.wordsToRedact.filter((_, i) => i !== target),
  };
}
