import { describe, expect, test } from "vitest";
import {
  REDACT_PRESETS,
  presetIdOfPattern,
  presetPatterns,
} from "@editor/data/redactPresets";
import {
  customWordsForDisplay,
  escapeRegexLiteral,
  selectedPresetIds,
  unescapeRegexLiteral,
  withCustomWordAdded,
  withCustomWordRemoved,
  withPresets,
} from "@editor/components/tools/redact/redactWords";

const [EMAIL, PHONE] = presetPatterns(["email", "phone"]);
const LOOSE_CARD_REGEX =
  "\\b(?:4\\d{12}(?:\\d{3})?|5[1-5]\\d{14}|3[47]\\d{13}|6(?:011|5\\d{2})\\d{12})\\b";

function matchesOf(pattern: string, text: string): string[] {
  return [...text.matchAll(new RegExp(pattern, "gi"))].map((m) => m[0]);
}

describe("redact presets", () => {
  test("every preset maps to its own pattern and back", () => {
    for (const preset of REDACT_PRESETS) {
      expect(presetPatterns([preset.id])).toEqual([preset.pattern]);
      expect(presetIdOfPattern(preset.pattern)).toBe(preset.id);
    }
  });

  test("email and phone leave case references, dates and log IDs alone", () => {
    const text =
      "Case reference 2026-0412, opened 2026-04-12 and reviewed 12/04/2026. " +
      "Log ID 7f3a-0042-19b2, entry 20260412-000173. Contact " +
      "jane.doe@records.example.gov, 020 7946 0958 or +44 20 7946 0958.";

    expect(matchesOf(EMAIL, text)).toEqual(["jane.doe@records.example.gov"]);
    expect(matchesOf(PHONE, text)).toEqual([
      "020 7946 0958",
      "+44 20 7946 0958",
    ]);
  });
});

describe("reading a saved word list", () => {
  test("splits presets from custom words", () => {
    const words = {
      wordsToRedact: [PHONE, "Confidential", EMAIL],
      useRegex: true,
    };

    expect(selectedPresetIds(words)).toEqual(["phone", "email"]);
    expect(customWordsForDisplay(words)).toEqual(["Confidential"]);
  });

  test("a regex that is not a preset is a custom entry", () => {
    const words = { wordsToRedact: [LOOSE_CARD_REGEX], useRegex: true };

    expect(selectedPresetIds(words)).toEqual([]);
    expect(customWordsForDisplay(words)).toEqual([LOOSE_CARD_REGEX]);
  });

  test("a preset pattern matched literally is not a preset", () => {
    const words = { wordsToRedact: [EMAIL], useRegex: false };

    expect(selectedPresetIds(words)).toEqual([]);
    expect(customWordsForDisplay(words)).toEqual([EMAIL]);
  });

  test("shows escaped custom words as typed while a preset is selected", () => {
    const words = {
      wordsToRedact: [EMAIL, "J\\. Smith \\(Jr\\.\\)", "\\d{4}"],
      useRegex: true,
    };

    expect(customWordsForDisplay(words)).toEqual(["J. Smith (Jr.)", "\\d{4}"]);
  });
});

describe("escaping custom words", () => {
  test("an escaped word matches only itself", () => {
    const escaped = escapeRegexLiteral("J. Smith (Jr.)");

    expect(escaped).toBe("J\\. Smith \\(Jr\\.\\)");
    expect(new RegExp(escaped).test("J. Smith (Jr.)")).toBe(true);
    expect(new RegExp(escaped).test("JX Smith Jr")).toBe(false);
  });

  test.each(["J. Smith (Jr.)", "a+b=c?", "C:\\path\\[x]", "$5 | ^top {1}"])(
    "unescapes %s back to the original",
    (word) => {
      expect(unescapeRegexLiteral(escapeRegexLiteral(word))).toBe(word);
    },
  );

  test.each(["\\d{4}", "a.b", "\\bword\\b", "x|y"])(
    "treats %s as a real regex",
    (word) => {
      expect(unescapeRegexLiteral(word)).toBeNull();
    },
  );
});

describe("changing the selection", () => {
  test("the first preset escapes plain words and turns Use Regex on", () => {
    const next = withPresets(
      { wordsToRedact: ["J. Smith (Jr.)"], useRegex: false },
      ["email"],
    );

    expect(next).toEqual({
      wordsToRedact: [EMAIL, "J\\. Smith \\(Jr\\.\\)"],
      useRegex: true,
    });
  });

  test("custom regexes are kept as they are", () => {
    const next = withPresets({ wordsToRedact: ["\\d{4}"], useRegex: true }, [
      "email",
    ]);

    expect(next.wordsToRedact).toEqual([EMAIL, "\\d{4}"]);
  });

  test("swapping presets keeps custom words", () => {
    const next = withPresets(
      { wordsToRedact: [EMAIL, "Confidential"], useRegex: true },
      ["phone"],
    );

    expect(next.wordsToRedact).toEqual([PHONE, "Confidential"]);
  });

  test("clearing the last preset restores plain words", () => {
    const next = withPresets(
      { wordsToRedact: [EMAIL, "J\\. Smith \\(Jr\\.\\)"], useRegex: true },
      [],
    );

    expect(next).toEqual({
      wordsToRedact: ["J. Smith (Jr.)"],
      useRegex: false,
    });
  });

  test("clearing the last preset keeps Use Regex on for a real regex", () => {
    const next = withPresets(
      { wordsToRedact: [EMAIL, "J\\. Smith", "\\d{4}"], useRegex: true },
      [],
    );

    expect(next).toEqual({
      wordsToRedact: ["J\\. Smith", "\\d{4}"],
      useRegex: true,
    });
  });

  test("adding a word while a preset is selected escapes it", () => {
    const next = withCustomWordAdded(
      { wordsToRedact: [EMAIL], useRegex: true },
      "J. Smith (Jr.)",
    );

    expect(next.wordsToRedact).toEqual([EMAIL, "J\\. Smith \\(Jr\\.\\)"]);
  });

  test("adding a word with no preset stores it as typed", () => {
    const next = withCustomWordAdded(
      { wordsToRedact: [], useRegex: false },
      "J. Smith",
    );

    expect(next.wordsToRedact).toEqual(["J. Smith"]);
  });

  test("removing counts custom words only", () => {
    const next = withCustomWordRemoved(
      { wordsToRedact: ["First", EMAIL, "Second"], useRegex: true },
      1,
    );

    expect(next.wordsToRedact).toEqual(["First", EMAIL]);
  });
});
