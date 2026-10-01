import { describe, expect, test } from "vitest";
import { flattenTranslationStrings } from "@app/data/settingsContentSearch";

describe("flattenTranslationStrings", () => {
  test("keeps plain strings and walks nested subtrees", () => {
    expect(
      flattenTranslationStrings({
        description: "  Static general description:  ",
        nested: { label: "Inner label" },
        list: ["First", "Second"],
      }),
    ).toEqual([
      "Static general description:",
      "Inner label",
      "First",
      "Second",
    ]);
  });

  test("excludes strings that contain unresolved interpolation placeholders", () => {
    expect(
      flattenTranslationStrings({
        defaultLabel: "Default: {{shortcut}}",
        notificationLabel: "Send {{email}} about {{message}}",
        leadingPlaceholder: "{{shortcut}}: Open settings",
        plain: "Keyboard shortcuts",
      }),
    ).toEqual(["Keyboard shortcuts"]);
  });

  test("removes indexed Trans markup", () => {
    expect(flattenTranslationStrings("<0>test</0> setting")).toEqual([
      "test setting",
    ]);
  });

  test("drops placeholder-only content entirely", () => {
    expect(
      flattenTranslationStrings({
        emailOnly: "{{email}}",
        messageOnly: "<0>{{message}}</0>",
        blank: "   ",
      }),
    ).toEqual([]);
  });
});
