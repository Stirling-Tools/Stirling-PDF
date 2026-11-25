import { describe, expect, it } from "vitest";
import type { AccessibilityIssue } from "@editor/types/checkAccessibility";
import { fixTargetFor } from "@editor/utils/accessibilityFixes";

function issue(
  specification: string,
  clause: string,
  testNumber: string,
): AccessibilityIssue {
  return {
    clause,
    testNumber,
    specification,
    message: "",
    severity: "error",
    occurrences: 1,
    autoFixable: false,
  };
}

describe("fixTargetFor", () => {
  it.each([
    ["PDF/UA-1", "7.1", "3", "untagged"],
    ["PDF/UA-1", "7.3", "1", "image"],
    ["PDF/UA-1", "7.4.2", "1", "heading"],
    ["PDF/UA-1", "7.18.5", "1", "link"],
    ["PDF/UA-1", "7.18.5", "2", "link"],
    ["PDF/UA-1", "6.2", "1", "markedTagged"],
    ["PDF/UA-2", "8.2.2", "1", "untagged"],
    ["PDF/UA-2", "8.2.5.28.2", "1", "image"],
  ])("sends %s §%s-%s to %s", (spec, clause, test, target) => {
    expect(fixTargetFor(issue(spec, clause, test))).toBe(target);
  });

  it.each([
    ["form field", "PDF/UA-1", "7.18.4", "1"],
    ["form field description", "PDF/UA-1", "7.18.1", "3"],
    ["non-link annotation", "PDF/UA-1", "7.18.1", "2"],
    ["title", "PDF/UA-1", "7.1", "9"],
    ["font", "PDF/UA-1", "7.21.4.1", "1"],
    ["tab order", "PDF/UA-1", "7.18.3", "1"],
    ["rule we have no wording for", "PDF/UA-1", "7.5", "1"],
    // The report sets the language beside these, in its Language area.
    ["document language", "PDF/UA-1", "7.2", "34"],
    ["content language", "PDF/UA-2", "8.4.4", "1"],
  ])("offers no fix for a %s rule", (_name, spec, clause, test) => {
    expect(fixTargetFor(issue(spec, clause, test))).toBeNull();
  });
});
