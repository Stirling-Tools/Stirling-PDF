import { describe, expect, it } from "vitest";
import {
  allowConsole,
  expectConsole,
  formatArgs,
  matches,
} from "@app/tests/failOnConsole";

describe("failOnConsole", () => {
  describe("matches", () => {
    it("treats a string matcher as a substring test", () => {
      expect(matches("foo", "the foo bar")).toBe(true);
      expect(matches("foo", "no match here")).toBe(false);
    });

    it("treats a RegExp matcher as a .test() call", () => {
      expect(matches(/^\[Tag\]/, "[Tag] something")).toBe(true);
      expect(matches(/^\[Tag\]/, "prefix [Tag] something")).toBe(false);
    });

    it("string match is case-sensitive", () => {
      expect(matches("Foo", "foo")).toBe(false);
    });
  });

  describe("formatArgs", () => {
    it("joins string args with spaces", () => {
      expect(formatArgs(["one", "two", "three"])).toBe("one two three");
    });

    it("stringifies plain objects with JSON", () => {
      expect(formatArgs([{ a: 1, b: "x" }])).toBe('{"a":1,"b":"x"}');
    });

    it("uses the stack for Error instances when present", () => {
      const err = new Error("boom");
      const result = formatArgs(["context:", err]);
      expect(result).toContain("context:");
      expect(result).toContain("boom");
    });

    it("falls back to String() when JSON.stringify throws (circular ref)", () => {
      const circular: Record<string, unknown> = { name: "loop" };
      circular.self = circular;
      const out = formatArgs([circular]);
      expect(out).toBe("[object Object]");
    });

    it("handles non-string, non-Error primitives", () => {
      expect(formatArgs([42, true, null])).toBe("42 true null");
    });
  });

  describe("expectConsole / allowConsole integration", () => {
    it("expectConsole.error absorbs a matching call and satisfies the expectation", () => {
      expectConsole.error(/expected sentinel/);
      console.error("an expected sentinel was emitted");
      // No assertion failure here means: the call was absorbed AND
      // afterEach won't throw because the expectation matched.
    });

    it("allowConsole.warn absorbs a matching call without asserting it fires", () => {
      allowConsole.warn(/optional sentinel/);
      // Intentionally do NOT call console.warn. The test should still
      // pass because allowConsole is non-required.
    });

    it("allowConsole.warn absorbs the call when it does fire too", () => {
      allowConsole.warn(/optional sentinel that does fire/);
      console.warn("optional sentinel that does fire now");
    });

    it("supports a string matcher (substring)", () => {
      expectConsole.warn("substring sentinel inside");
      console.warn("a substring sentinel inside a longer message");
    });
  });
});
