/**
 * Unit tests for the PostScript / PDF object reader.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, test, expect } from "vitest";
import {
  collectTopLevelDicts,
  psArray,
  psBoolean,
  psDict,
  psName,
  PsName,
  psNumber,
  PsRef,
  readObjects,
} from "@app/utils/postscriptObjects";

const onlyDict = (src: string) => {
  const dicts = collectTopLevelDicts(src);
  expect(dicts).toHaveLength(1);
  return dicts[0];
};

describe("postscriptObjects", () => {
  describe("literal strings", () => {
    test("reads a plain string", () => {
      expect(onlyDict("<< /T (Ada Lovelace) >>").T).toBe("Ada Lovelace");
    });

    test("keeps balanced nested parentheses without escapes", () => {
      expect(onlyDict("<< /T (a (b (c)) d) >>").T).toBe("a (b (c)) d");
    });

    test("honours escaped parentheses and backslashes", () => {
      expect(onlyDict("<< /T (a\\(b\\)c\\\\d) >>").T).toBe("a(b)c\\d");
    });

    test("decodes the named escapes", () => {
      expect(onlyDict("<< /T (a\\nb\\rc\\td\\be\\ff) >>").T).toBe(
        "a\nb\rc\td\be\ff",
      );
    });

    test("decodes one-, two- and three-digit octal escapes", () => {
      const dict = onlyDict("<< /A (\\101) /B (\\7) /C (\\0053) >>");
      expect(dict.A).toBe("A");
      expect(dict.B).toBe("\x07");
      // \005 is the escape; the trailing '3' is a literal character.
      expect(dict.C).toBe("\x053");
    });

    test("an octal escape wraps to a single byte", () => {
      expect(onlyDict("<< /T (\\377) >>").T).toBe("\u00FF");
    });

    test("a backslash before a newline continues the line", () => {
      expect(onlyDict("<< /T (one\\\ntwo) >>").T).toBe("onetwo");
      expect(onlyDict("<< /T (one\\\r\ntwo) >>").T).toBe("onetwo");
    });

    test("an unterminated string still yields what was read", () => {
      expect(onlyDict("<< /T (never closed").T).toBe("never closed");
    });
  });

  describe("hex strings", () => {
    test("decodes byte pairs", () => {
      expect(onlyDict("<< /T <48656C6C6F> >>").T).toBe("Hello");
    });

    test("pads an odd digit count with a trailing zero", () => {
      // <4A5> is <4A50>, per PDF 32000-1 7.3.4.3.
      expect(onlyDict("<< /T <4A5> >>").T).toBe("JP");
    });

    test("ignores whitespace between digits", () => {
      expect(onlyDict("<< /T <48 65\n6C 6C 6F> >>").T).toBe("Hello");
    });

    test("preserves a UTF-16 BOM as raw bytes", () => {
      const value = onlyDict("<< /T <FEFF00410042> >>").T;
      expect(typeof value).toBe("string");
      expect(value).toBe("\u00FE\u00FF\x00A\x00B");
    });

    test("an empty hex string is an empty value", () => {
      expect(onlyDict("<< /T <> >>").T).toBe("");
    });
  });

  describe("names", () => {
    test("reads a name distinctly from a string", () => {
      const dict = onlyDict("<< /V /Yes >>");
      expect(dict.V).toBeInstanceOf(PsName);
      expect(psName(dict.V)).toBe("Yes");
    });

    test("decodes #XX escapes", () => {
      expect(psName(onlyDict("<< /K /A#20B#2Fc >>").K)).toBe("A B/c");
    });

    test("a delimiter ends the name", () => {
      const dict = onlyDict("<< /A/B /C(x) >>");
      expect(psName(dict.A)).toBe("B");
      expect(dict.C).toBe("x");
    });

    test("an empty name is read as an empty string", () => {
      expect(psName(onlyDict("<< / /X >>")[""])).toBe("X");
    });
  });

  describe("numbers, booleans and null", () => {
    test("reads integers, reals and signed values", () => {
      const dict = onlyDict("<< /A 42 /B -3.5 /C +7 /D .5 /E 6. >>");
      expect(psNumber(dict.A)).toBe(42);
      expect(psNumber(dict.B)).toBe(-3.5);
      expect(psNumber(dict.C)).toBe(7);
      expect(psNumber(dict.D)).toBe(0.5);
      expect(psNumber(dict.E)).toBe(6);
    });

    test("reads booleans and null", () => {
      const dict = onlyDict("<< /A true /B false /C null >>");
      expect(psBoolean(dict.A)).toBe(true);
      expect(psBoolean(dict.B)).toBe(false);
      expect(dict.C).toBeNull();
    });

    test("a non-numeric word is an operator, not a number", () => {
      expect(psNumber(onlyDict("<< /A 1.2.3 >>").A)).toBeUndefined();
    });
  });

  describe("arrays and dictionaries", () => {
    test("reads a nested array of mixed values", () => {
      const items = psArray(onlyDict("<< /A [1 (two) /Three [4]] >>").A);
      expect(items).toHaveLength(4);
      expect(items?.[0]).toBe(1);
      expect(items?.[1]).toBe("two");
      expect(psName(items?.[2] ?? null)).toBe("Three");
      expect(psArray(items?.[3] ?? null)).toEqual([4]);
    });

    test("reads a nested dictionary", () => {
      const inner = psDict(onlyDict("<< /Outer << /Inner (v) >> >>").Outer);
      expect(inner?.Inner).toBe("v");
    });

    test("a trailing key with no value reads as null", () => {
      const dict = onlyDict("<< /A (v) /B >>");
      expect(dict.A).toBe("v");
      expect(dict.B).toBeNull();
    });

    test("a stray value in key position is skipped, not fatal", () => {
      const dict = onlyDict("<< 99 /A (v) >>");
      expect(dict.A).toBe("v");
    });

    test("an unclosed array does not swallow the enclosing dictionary close", () => {
      const dict = onlyDict("<< /A [1 2 >>");
      expect(psArray(dict.A)).toEqual([1, 2]);
    });

    test("a later duplicate key wins", () => {
      expect(onlyDict("<< /A (first) /A (second) >>").A).toBe("second");
    });
  });

  describe("comments and procedures", () => {
    test("skips comments, including the %FDF- header", () => {
      const dict = onlyDict("%FDF-1.2\n<< /A (v) >> % trailing\n%%EOF\n");
      expect(dict.A).toBe("v");
    });

    test("drops procedure braces but keeps their contents", () => {
      expect(psArray(onlyDict("<< /A [{1 2}] >>").A)).toEqual([1, 2]);
    });
  });

  describe("indirect objects", () => {
    test("splits obj bodies from a trailer dictionary", () => {
      const { topLevelDicts, indirect } = readObjects(
        "%FDF-1.2\n" +
          "1 0 obj<</FDF 2 0 R>>endobj\n" +
          "2 0 obj<</Fields [3 0 R]>>endobj\n" +
          "trailer<</Root 1 0 R>>\n",
      );
      expect(topLevelDicts).toHaveLength(3);
      expect(indirect.size).toBe(2);
      expect(psDict(indirect.get(2) ?? null)).toBeDefined();
    });

    test("reads N G R as a reference rather than two numbers", () => {
      const value = onlyDict("<< /A 8 0 R >>").A;
      expect(value).toBeInstanceOf(PsRef);
      expect((value as PsRef).objectNumber).toBe(8);
      expect((value as PsRef).generation).toBe(0);
    });

    test("an array of references keeps each one", () => {
      const items = psArray(onlyDict("<< /Kids [3 0 R 4 0 R] >>").Kids);
      expect(items?.map((item) => (item as PsRef).objectNumber)).toEqual([
        3, 4,
      ]);
    });

    test("a non-dictionary obj body is still resolvable", () => {
      const { indirect, topLevelDicts } = readObjects(
        "7 0 obj (a value) endobj",
      );
      expect(indirect.get(7)).toBe("a value");
      expect(topLevelDicts).toHaveLength(0);
    });
  });

  describe("type guards", () => {
    test("psDict rejects arrays, names and references", () => {
      expect(psDict([])).toBeUndefined();
      expect(psDict(new PsName("X"))).toBeUndefined();
      expect(psDict(new PsRef(1, 0))).toBeUndefined();
      expect(psDict(null)).toBeUndefined();
      expect(psDict({ A: 1 })).toEqual({ A: 1 });
    });

    test("psName tolerates a writer that quotes the name as a string", () => {
      expect(psName("Yes")).toBe("Yes");
      expect(psName(1)).toBeUndefined();
    });

    test("psNumber rejects a non-finite value", () => {
      expect(psNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
      expect(psNumber(Number.NaN)).toBeUndefined();
    });
  });

  describe("malformed input", () => {
    test("empty and whitespace-only sources yield nothing", () => {
      expect(collectTopLevelDicts("")).toEqual([]);
      expect(collectTopLevelDicts("  \n\t ")).toEqual([]);
    });

    test("a stray close delimiter does not stall the tokenizer", () => {
      expect(onlyDict(") ] >> << /A (v) >>").A).toBe("v");
    });

    test("an unclosed dictionary still returns what it read", () => {
      expect(onlyDict("<< /A (v)").A).toBe("v");
    });
  });

  describe("source encoding", () => {
    // These suites assert on control characters, so it is easy to paste a raw
    // one into a literal. Git's binary heuristic then stores and diffs the
    // whole file as binary, and the tests stop being reviewable.
    const isControlByte = (byte: number) =>
      byte !== 0x09 &&
      byte !== 0x0a &&
      byte !== 0x0d &&
      (byte < 0x20 || byte === 0x7f);

    test.each(["postscriptObjects.test.ts", "formDataExchange.test.ts"])(
      "%s spells control characters as escapes",
      (name) => {
        const bytes = readFileSync(
          fileURLToPath(new URL(name, import.meta.url)),
        );
        const offsets = [...bytes.entries()]
          .filter(([, byte]) => isControlByte(byte))
          .map(([offset, byte]) => `0x${byte.toString(16)} at byte ${offset}`);
        expect(offsets).toEqual([]);
      },
    );
  });
});
