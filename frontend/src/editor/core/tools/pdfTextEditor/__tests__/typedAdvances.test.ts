import { describe, expect, test } from "vitest";
import {
  lineWidthPx,
  mergeAdvances,
  unpricedChars,
} from "@editor/tools/pdfTextEditor/util/typedAdvances";

const BROWSER_PX = 20;
const browser = () => BROWSER_PX;

describe("typed letter prices", () => {
  test("names the letters the table cannot price, line breaks aside", () => {
    const table = new Map([["a", 0.5]]);
    expect([...unpricedChars("ab\nca", table)].sort()).toEqual(["b", "c"]);
    expect(unpricedChars("aa", table).size).toBe(0);
  });

  test("a learned price replaces the one the run started with", () => {
    const merged = mergeAdvances(
      new Map([
        ["a", 0.5],
        ["b", 0.6],
      ]),
      new Map([["a", 0.4]]),
    );
    expect(merged?.get("a")).toBe(0.4);
    expect(merged?.get("b")).toBe(0.6);
  });

  test("prices typed letters from the table and unknown ones from the browser", () => {
    const table = new Map([["a", 0.5]]);
    // 10px font: "a" is 5px, "z" falls back to the browser's 20px.
    expect(lineWidthPx("aaz", 0, null, table, 10, 1, browser)).toBe(30);
  });

  test("keeps the engine's width for the measured part and prices only what was typed after it", () => {
    const measured = {
      text: "ab cd",
      starts: [0, 4, NaN, 12, 16],
      ends: [5, 9, NaN, 17, 21],
    };
    const table = new Map([["e", 0.5]]);
    // The measured line reaches 21pt; at 2px/pt that is 42px, plus "e" at 5px.
    expect(lineWidthPx("ab cde", 0, measured, table, 10, 2, browser)).toBe(47);
  });

  test("an edit inside the measured text prices from the first changed letter", () => {
    const measured = {
      text: "abcd",
      starts: [0, 4, 8, 12],
      ends: [5, 9, 13, 17],
    };
    const table = new Map([
      ["x", 0.4],
      ["c", 0.4],
      ["d", 0.4],
    ]);
    // "ab" is known: the pen stands at 8pt (16px) before the changed letter.
    expect(lineWidthPx("abxcd", 0, measured, table, 10, 2, browser)).toBe(28);
  });

  test("measures the line the caret is on, ignoring its trailing spaces", () => {
    const measured = {
      text: "ab\ncd",
      starts: [0, 4, NaN, 0, 4],
      ends: [5, 9, NaN, 5, 9],
    };
    const table = new Map([[" ", 0.3]]);
    expect(lineWidthPx("ab\ncd  ", 1, measured, table, 10, 1, browser)).toBe(9);
  });
});
