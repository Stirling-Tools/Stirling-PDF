import { describe, test, expect } from "vitest";
import { expectConsole } from "@app/tests/failOnConsole";
import { editTableOfContentsFromApiParams } from "@app/hooks/tools/editTableOfContents/useEditTableOfContentsOperation";

describe("editTableOfContentsFromApiParams", () => {
  test("passes replaceExisting through", () => {
    expect(editTableOfContentsFromApiParams({ replaceExisting: true })).toEqual(
      {
        replaceExisting: true,
      },
    );
  });

  test("hydrates a valid (empty) bookmark array", () => {
    expect(
      editTableOfContentsFromApiParams({
        replaceExisting: false,
        bookmarkData: "[]",
      }),
    ).toEqual({ replaceExisting: false, bookmarks: [] });
  });

  test.each(["", "not json", "{truncated"])(
    "does not throw on malformed bookmarkData (%j); leaves bookmarks unset",
    (bookmarkData) => {
      expectConsole.warn(/could not parse bookmarkData/);
      const result = editTableOfContentsFromApiParams({
        replaceExisting: true,
        bookmarkData,
      });
      expect(result).toEqual({ replaceExisting: true });
      expect(result).not.toHaveProperty("bookmarks");
    },
  );

  test.each(["{}", "null", "42"])(
    "ignores non-array bookmarkData (%j) without throwing",
    (bookmarkData) => {
      const result = editTableOfContentsFromApiParams({
        replaceExisting: false,
        bookmarkData,
      });
      expect(result).not.toHaveProperty("bookmarks");
    },
  );
});
