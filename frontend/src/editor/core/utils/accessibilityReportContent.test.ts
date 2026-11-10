import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";
import type { AccessibilityIssue } from "@editor/types/checkAccessibility";
import {
  describeIssue,
  formatPageRanges,
} from "@editor/utils/accessibilityReportContent";

const t = ((_key: string, fallback: string, values?: Record<string, unknown>) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    String(values?.[name] ?? ""),
  )) as unknown as TFunction;

function issue(overrides: Partial<AccessibilityIssue>): AccessibilityIssue {
  return {
    clause: "7.1",
    testNumber: "3",
    specification: "PDF/UA-1",
    message: "Fallback message",
    severity: "error",
    occurrences: 1,
    autoFixable: false,
    ...overrides,
  };
}

describe("formatPageRanges", () => {
  it("collapses consecutive pages into ranges", () => {
    expect(formatPageRanges([1, 2, 3, 5, 7, 8])).toBe("1–3, 5, 7–8");
    expect(formatPageRanges([])).toBe("");
  });
});

describe("describeIssue", () => {
  it("leads with the plain title and keeps veraPDF's wording in the details", () => {
    const content = describeIssue(
      t,
      issue({
        errorMessage: "Content is neither marked as Artifact nor tagged",
        technicalMessage: "Content shall be marked as Artifact",
        occurrences: 4,
        pages: [1, 2, 3],
        object: "SESimpleContentItem",
      }),
    );
    expect(content.title).toBe("Content that isn't tagged");
    expect(content.summary).toBe("Pages 1–3 · 4 times");
    expect(content.details.map((detail) => detail.label)).toEqual([
      "Rule",
      "Applies to",
      "Pages",
      "Reported as",
      "Requirement",
    ]);
  });

  it("shows where a one-off issue is rather than a page range", () => {
    const content = describeIssue(
      t,
      issue({
        location: "root/document[0]/pages[4](13 0 obj PDPage)",
        pages: [5],
      }),
    );
    expect(content.details).toContainEqual({ label: "Where", value: "Page 5" });
  });

  it("falls back to veraPDF's message for a rule without a plain title", () => {
    const content = describeIssue(
      t,
      issue({ clause: "7.99", errorMessage: "Something veraPDF said" }),
    );
    expect(content.title).toBe("Something veraPDF said");
    expect(content.summary).toBe("Whole document");
    expect(content.details.map((detail) => detail.label)).not.toContain(
      "Reported as",
    );
  });
});
