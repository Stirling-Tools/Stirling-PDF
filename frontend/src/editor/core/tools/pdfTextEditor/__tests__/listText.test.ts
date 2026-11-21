import { describe, expect, test } from "vitest";
import {
  listIndentFor,
  continueList,
  listKindOf,
  mayBeList,
  toggledListText,
} from "@editor/tools/pdfTextEditor/util/listText";

describe("list markers", () => {
  test("marks each paragraph, leaving wrapped lines as they are", () => {
    const text = "Apples and\npears\nPlums";
    const soft = [false, true, false];
    expect(toggledListText(text, soft, "bullet")).toBe(
      "• Apples and\npears\n• Plums",
    );
    expect(toggledListText(text, soft, "number")).toBe(
      "1. Apples and\npears\n2. Plums",
    );
  });

  test("the same list again removes the markers, another kind swaps them", () => {
    const soft = [false, false];
    expect(toggledListText("• A\n• B", soft, "bullet")).toBe("A\nB");
    expect(toggledListText("• A\n• B", soft, "number")).toBe("1. A\n2. B");
  });

  test("reads which list text is", () => {
    expect(listKindOf("• A\n• B", [false, false])).toBe("bullet");
    expect(listKindOf("1. A\n2. B", [false, false])).toBe("number");
    expect(listKindOf("• A\nB", [false, false])).toBeNull();
    expect(mayBeList("Plain text")).toBe(false);
    expect(mayBeList("• Item")).toBe(true);
  });
});

describe("Enter in a list", () => {
  test("marks the new line as the next bullet or number", () => {
    expect(continueList("• Apples", "• Apples\n")).toEqual({
      splices: [{ start: 9, end: 9, insert: "• " }],
      caret: 11,
    });
    expect(continueList("1. One\n2. Two", "1. One\n2. Two\n")).toEqual({
      splices: [{ start: 14, end: 14, insert: "3. " }],
      caret: 17,
    });
  });

  test("marks a new item whose first letters came with the Enter", () => {
    expect(continueList("• Apples", "• Apples\nP")).toEqual({
      splices: [{ start: 9, end: 9, insert: "• " }],
      caret: 12,
    });
  });

  test("renumbers the items after one added in the middle, a line at a time", () => {
    expect(
      continueList("1. One\n2. Two\n3. Three", "1. One\n\n2. Two\n3. Three"),
    ).toEqual({
      splices: [
        { start: 7, end: 7, insert: "2. " },
        { start: 8, end: 11, insert: "3. " },
        { start: 15, end: 18, insert: "4. " },
      ],
      caret: 10,
    });
    expect(
      continueList("1. One\n2. Two\nAfter", "1. One\n\n2. Two\nAfter")?.splices,
    ).toHaveLength(2);
  });

  test("continues an item that wraps onto more lines", () => {
    expect(
      continueList("• Long item\nwrapped", "• Long item\nwrapped\n", [
        false,
        true,
      ]),
    ).toEqual({ splices: [{ start: 20, end: 20, insert: "• " }], caret: 22 });
    expect(
      continueList("Done\nafter", "Done\nafter\n", [false, true]),
    ).toBeNull();
  });

  test("Enter where an item wraps makes the wrapped rest the next item", () => {
    expect(
      continueList(
        "1. Long item\nwrapped\n2. Next",
        "1. Long item\n\nwrapped\n2. Next",
        [false, true, false],
      ),
    ).toEqual({
      splices: [
        { start: 12, end: 13, insert: "" },
        { start: 14, end: 14, insert: "2. " },
        { start: 22, end: 25, insert: "3. " },
      ],
      caret: 16,
    });
  });

  test("Enter at the start of a wrapped line is Enter where the item wraps", () => {
    const wrapAt = continueList(
      "1. Long item\nwrapped\n2. Next",
      "1. Long item\n\nwrapped\n2. Next",
      [false, true, false],
      13,
    );
    expect(
      continueList(
        "1. Long item\nwrapped\n2. Next",
        "1. Long item\n\nwrapped\n2. Next",
        [false, true, false],
        14,
      ),
    ).toEqual(wrapAt);
    expect(wrapAt?.splices[0]).toEqual({ start: 12, end: 13, insert: "" });
  });

  test("an empty item with trailing spaces ends the list without leaving them", () => {
    expect(continueList("• A\n•  ", "• A\n•  \n")).toEqual({
      splices: [{ start: 3, end: 7, insert: "" }],
      caret: 4,
    });
  });

  test("Enter inside an item makes the rest of it the next item", () => {
    expect(continueList("• Apples", "• App\nles")).toEqual({
      splices: [{ start: 6, end: 6, insert: "• " }],
      caret: 8,
    });
    expect(
      continueList("1. One two\n2. Three", "1. \nOne two\n2. Three"),
    ).toEqual({
      splices: [
        { start: 4, end: 4, insert: "2. " },
        { start: 12, end: 15, insert: "3. " },
      ],
      caret: 7,
    });
    expect(continueList("Plain text", "Plain\n text")).toBeNull();
  });

  test("Enter on the line after a list, not at the end of its item, adds a plain line", () => {
    expect(continueList("• A\n", "• A\n\n", [], 5)).toBeNull();
    expect(continueList("• A\n", "• A\n\n", [], 4)).toEqual({
      splices: [{ start: 4, end: 4, insert: "• " }],
      caret: 6,
    });
    expect(
      continueList("1. One\n2. Two\nAfter", "1. One\n2. Two\n\nAfter", [], 15),
    ).toBeNull();
    expect(
      continueList("1. One\n2. Two", "1. One\n\n2. Two", [], 8),
    ).toBeNull();
  });

  test("on an empty item ends the list", () => {
    expect(continueList("• Apples\n• ", "• Apples\n• \n")).toEqual({
      splices: [{ start: 8, end: 11, insert: "" }],
      caret: 9,
    });
    expect(continueList("• ", "• \n")).toEqual({
      splices: [{ start: 0, end: 3, insert: "" }],
      caret: 0,
    });
  });

  test("leaves every other edit alone", () => {
    expect(continueList("Plain", "Plain\n")).toBeNull();
    expect(continueList("• Apples", "• Apples!")).toBeNull();
    expect(continueList("• A", "• A\n• B")).toBeNull();
  });
});

describe("listIndentFor", () => {
  test("sets wrapped lines past the widest marker", () => {
    const monospace = (line: string) => line.length * 5;
    expect(listIndentFor("9. Nine\n10. Ten", monospace)).toBe(20);
    expect(listIndentFor("• One\n• Two", monospace)).toBe(10);
    expect(listIndentFor("Plain text", monospace)).toBe(0);
  });
});
