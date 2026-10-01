import { describe, it, expect } from "vitest";
import {
  findMatches,
  foldForSearch,
  isWordChar,
  replaceMatch,
  replaceMatches,
} from "@app/tools/pdfTextEditor/util/textMatching";
import type { TextMatch } from "@app/tools/pdfTextEditor/util/textMatching";

const RESUME_ACCENTED = "résumé";
const RESUME_DECOMPOSED = "résumé";
const CAFE_DECOMPOSED = "café";

function slices(haystack: string, matches: TextMatch[]): string[] {
  return matches.map((m) => haystack.slice(m.start, m.end));
}

describe("findMatches degenerate input", () => {
  it("returns no matches for an empty needle", () => {
    expect(findMatches("hello world", "")).toEqual([]);
    expect(findMatches("", "")).toEqual([]);
  });

  it("returns no matches for an empty haystack", () => {
    expect(findMatches("", "a")).toEqual([]);
  });

  it("returns no matches when the needle is longer than the haystack", () => {
    expect(findMatches("abc", "abcd")).toEqual([]);
    expect(findMatches("abc", "abcd", { ignoreAccents: true })).toEqual([]);
  });
});

describe("findMatches case handling", () => {
  it("is case-insensitive by default", () => {
    expect(findMatches("Foo foo FOO", "foo")).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 11 },
    ]);
  });

  it("honours matchCase", () => {
    expect(findMatches("Foo foo FOO", "foo", { matchCase: true })).toEqual([
      { start: 4, end: 7 },
    ]);
  });

  it("case-folds non-ASCII letters", () => {
    expect(findMatches("ÉCOLE", "école")).toEqual([{ start: 0, end: 5 }]);
    expect(findMatches("ÉCOLE", "école", { matchCase: true })).toEqual([]);
  });
});

describe("findMatches overlapping candidates", () => {
  it("returns non-overlapping matches, scanning left to right", () => {
    expect(findMatches("aaaa", "aa")).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
    expect(findMatches("aaa", "aa")).toEqual([{ start: 0, end: 2 }]);
  });

  it("does not lose a later match when an earlier candidate is rejected", () => {
    expect(findMatches("abcab ab", "ab", { wholeWord: true })).toEqual([
      { start: 6, end: 8 },
    ]);
  });
});

describe("findMatches accent folding", () => {
  const hay = `Le ${RESUME_ACCENTED} final`;

  it("matches accented text against unaccented input when enabled", () => {
    const found = findMatches(hay, "resume", { ignoreAccents: true });
    expect(found).toEqual([{ start: 3, end: 9 }]);
    expect(slices(hay, found)).toEqual([RESUME_ACCENTED]);
  });

  it("does not match accented text when the flag is off", () => {
    expect(findMatches(hay, "resume")).toEqual([]);
  });

  it("folds the needle as well as the haystack", () => {
    expect(
      findMatches("the resume", RESUME_ACCENTED, { ignoreAccents: true }),
    ).toEqual([{ start: 4, end: 10 }]);
  });

  it("does not attempt non-diacritic folding such as sharp s", () => {
    expect(findMatches("Straße", "Strasse", { ignoreAccents: true })).toEqual(
      [],
    );
  });

  it("leaves standalone combining marks alone, so decomposed text is not folded", () => {
    // Dropping the mark would shift every later offset, so length stability wins.
    expect(RESUME_DECOMPOSED).toHaveLength(8);
    expect(
      findMatches(RESUME_DECOMPOSED, "resume", { ignoreAccents: true }),
    ).toEqual([]);
  });
});

describe("foldForSearch offset stability", () => {
  const mixed = `Élan \u{1f600} naïve İstanbul ${RESUME_ACCENTED} 中文 ẞ_1`;

  it("keeps the folded length identical to the original", () => {
    for (const opts of [
      {},
      { matchCase: true },
      { ignoreAccents: true },
      { matchCase: true, ignoreAccents: true },
    ]) {
      expect(foldForSearch(mixed, opts)).toHaveLength(mixed.length);
    }
  });

  it("maps a folded index back to the identical index in the original", () => {
    const folded = foldForSearch(mixed, { ignoreAccents: true });
    const at = folded.indexOf("naive");
    expect(at).toBeGreaterThan(-1);
    expect(mixed.slice(at, at + 5)).toBe("naïve");
  });

  it("reports offsets that slice the original text back out", () => {
    const found = findMatches(mixed, "resume", { ignoreAccents: true });
    expect(slices(mixed, found)).toEqual([RESUME_ACCENTED]);
  });
});

describe("findMatches whole word", () => {
  it("matches at the very start and end of the string", () => {
    expect(findMatches("cat", "cat", { wholeWord: true })).toEqual([
      { start: 0, end: 3 },
    ]);
    expect(findMatches("a cat", "cat", { wholeWord: true })).toEqual([
      { start: 2, end: 5 },
    ]);
    expect(findMatches("cat nap", "cat", { wholeWord: true })).toEqual([
      { start: 0, end: 3 },
    ]);
  });

  it("rejects a match glued to other word characters", () => {
    expect(findMatches("concatenate", "cat", { wholeWord: true })).toEqual([]);
    expect(findMatches("cat5", "cat", { wholeWord: true })).toEqual([]);
    expect(findMatches("cat_", "cat", { wholeWord: true })).toEqual([]);
    expect(findMatches("_cat", "cat", { wholeWord: true })).toEqual([]);
  });

  it("accepts punctuation and whitespace as boundaries", () => {
    expect(findMatches("(cat), cat.", "cat", { wholeWord: true })).toEqual([
      { start: 1, end: 4 },
      { start: 7, end: 10 },
    ]);
  });

  it("treats non-ASCII letters as word characters, unlike ASCII regex breaks", () => {
    expect(findMatches("Straße", "stra", { wholeWord: true })).toEqual([]);
    expect(findMatches("naïve", "na", { wholeWord: true })).toEqual([]);
    expect(findMatches(`un café.`, "café", { wholeWord: true })).toEqual([
      { start: 3, end: 7 },
    ]);
  });

  it("treats a trailing combining mark as a word character", () => {
    expect(findMatches(CAFE_DECOMPOSED, "cafe", { wholeWord: true })).toEqual(
      [],
    );
  });

  it("combines with accent folding", () => {
    expect(
      findMatches("un café.", "cafe", {
        wholeWord: true,
        ignoreAccents: true,
      }),
    ).toEqual([{ start: 3, end: 7 }]);
  });

  it("classifies word characters Unicode-aware", () => {
    expect(isWordChar("ß")).toBe(true);
    expect(isWordChar("中")).toBe(true);
    expect(isWordChar("٣")).toBe(true);
    expect(isWordChar("_")).toBe(true);
    expect(isWordChar("́")).toBe(true);
    expect(isWordChar(" ")).toBe(false);
    expect(isWordChar("-")).toBe(false);
    expect(isWordChar("")).toBe(false);
    expect(isWordChar(null)).toBe(false);
  });
});

// CJK ideographs are letters and are not space-delimited, so whole-word only
// matches a run bounded by punctuation or spaces.
describe("findMatches with CJK", () => {
  it("matches freely when whole word is off", () => {
    expect(findMatches("中文文档", "文")).toEqual([
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ]);
  });

  it("finds nothing mid-phrase when whole word is on", () => {
    expect(findMatches("中文文档", "文", { wholeWord: true })).toEqual([]);
  });

  it("matches a delimited CJK phrase when whole word is on", () => {
    expect(
      findMatches("「中文」と", "中文", {
        wholeWord: true,
      }),
    ).toEqual([{ start: 1, end: 3 }]);
  });
});

describe("findMatches with astral characters", () => {
  it("does not split a surrogate pair when checking word boundaries", () => {
    expect(
      findMatches("\u{1f600}cat\u{1f600}", "cat", { wholeWord: true }),
    ).toEqual([{ start: 2, end: 5 }]);
  });
});

describe("replaceMatch", () => {
  it("splices the replacement literally", () => {
    expect(replaceMatch("hello world", { start: 6, end: 11 }, "there")).toBe(
      "hello there",
    );
  });

  it("never interprets $ sequences as regex references", () => {
    expect(replaceMatch("say foo", { start: 4, end: 7 }, "$&")).toBe("say $&");
    expect(replaceMatch("say foo", { start: 4, end: 7 }, "$1$$$'")).toBe(
      "say $1$$$'",
    );
  });

  it("supports deletion and guards out-of-range offsets", () => {
    expect(replaceMatch("abcd", { start: 1, end: 3 }, "")).toBe("ad");
    expect(replaceMatch("abcd", { start: 2, end: 9 }, "x")).toBe("abcd");
    expect(replaceMatch("abcd", { start: 3, end: 1 }, "x")).toBe("abcd");
  });
});

describe("replaceMatches", () => {
  it("rewrites every match in one pass", () => {
    const hay = "Foo foo FOO";
    expect(replaceMatches(hay, findMatches(hay, "foo"), "bar")).toBe(
      "bar bar bar",
    );
  });

  it("returns the text unchanged when there are no matches", () => {
    expect(replaceMatches("abc", [], "x")).toBe("abc");
  });

  it("keeps replacement text literal", () => {
    const hay = "a b a";
    expect(replaceMatches(hay, findMatches(hay, "a"), "$&")).toBe("$& b $&");
  });

  it("preserves accented context around folded matches", () => {
    const hay = `Le ${RESUME_ACCENTED} final`;
    const found = findMatches(hay, "resume", { ignoreAccents: true });
    expect(replaceMatches(hay, found, "summary")).toBe("Le summary final");
  });
});
