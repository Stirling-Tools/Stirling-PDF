import { describe, expect, it } from "vitest";
import { offsetAcrossRewrap } from "@editor/tools/pdfTextEditor/util/wrapCaret";

describe("offsetAcrossRewrap", () => {
  it("keeps the caret after the same letter when a space becomes a line break", () => {
    expect(offsetAcrossRewrap("one two three", 13, "one two\nthree")).toBe(13);
    expect(offsetAcrossRewrap("one two three", 5, "one\ntwo three")).toBe(5);
  });

  it("keeps the caret after a space it had just passed", () => {
    expect(offsetAcrossRewrap("one two ", 8, "one\ntwo ")).toBe(8);
  });

  it("follows the letters when the rewrap drops a doubled space", () => {
    expect(offsetAcrossRewrap("one  two", 8, "one\ntwo")).toBe(7);
  });

  it("puts a caret before the first letter at the start", () => {
    expect(offsetAcrossRewrap("one two", 0, "one\ntwo")).toBe(0);
  });

  it("stops at the end of shorter text", () => {
    expect(offsetAcrossRewrap("one two", 7, "one")).toBe(3);
  });
});
