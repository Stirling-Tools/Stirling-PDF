// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  categoryOf,
  scoreAccessibilityReport,
} from "@editor/utils/accessibilityScore";
import type {
  AccessibilityIssue,
  AccessibilityReport,
} from "@editor/types/checkAccessibility";

const issue = (clause: string, tags: string[]): AccessibilityIssue => ({
  clause,
  testNumber: "1",
  message: "",
  severity: "error",
  occurrences: 1,
  autoFixable: false,
  tags,
});

const report = (
  issues: AccessibilityIssue[],
  overrides: Partial<AccessibilityReport> = {},
): AccessibilityReport => ({
  profile: "PDF/UA-1",
  tagged: true,
  declaresConformance: true,
  passesAutomatedChecks: issues.length === 0,
  issues,
  humanChecks: [],
  automaticallyFixable: 0,
  needsInput: 0,
  figuresNeedingDescription: [],
  summary: {
    pages: 1,
    hasTitle: true,
    displaysDocTitle: true,
    hasLanguage: true,
    allFontsEmbedded: true,
    unembeddedFonts: 0,
    figures: 0,
    encrypted: false,
  },
  ...overrides,
});

describe("categoryOf", () => {
  it("puts the language of alternative text under alt text", () => {
    expect(categoryOf(issue("7.2", ["lang", "alt-text"]))).toBe("altText");
  });

  it("puts a table rule under structure", () => {
    expect(categoryOf(issue("7.5", ["structure", "table"]))).toBe("structure");
  });

  it("falls back to structure when the backend sends no tags", () => {
    expect(categoryOf({ ...issue("7.1", []), tags: undefined })).toBe(
      "structure",
    );
  });
});

describe("scoreAccessibilityReport", () => {
  it("gives a clean tagged report 100 and a pass", () => {
    const result = scoreAccessibilityReport(report([]));
    expect(result.score).toBe(100);
    expect(result.grade).toBe("pass");
  });

  it("halves a category on its first failing rule", () => {
    const result = scoreAccessibilityReport(
      report([issue("7.3", ["alt-text", "structure", "figure"])]),
    );
    expect(result.score).toBe(90);
    expect(result.categories.find((c) => c.id === "altText")?.points).toBe(10);
  });

  it("counts a rule once however often it fails", () => {
    const once = scoreAccessibilityReport(report([issue("7.21", ["font"])]));
    const often = scoreAccessibilityReport(
      report([{ ...issue("7.21", ["font"]), occurrences: 5000 }]),
    );
    expect(often.score).toBe(once.score);
  });

  it("halves the score of an untagged document", () => {
    const result = scoreAccessibilityReport(report([], { tagged: false }));
    expect(result.score).toBe(50);
    expect(result.untaggedPenaltyApplied).toBe(true);
    expect(result.grade).toBe("needsWork");
  });

  it("does not call a clean score a pass when the validator disagrees", () => {
    const result = scoreAccessibilityReport(
      report([], { passesAutomatedChecks: false }),
    );
    expect(result.grade).toBe("minor");
  });
});

describe("rules per category", () => {
  it("totals the profile's rules with the same tag precedence as issues", () => {
    const checks = {
      total: 0,
      failed: 0,
      passed: 0,
      rulesInProfile: 6,
      rulesFailed: 0,
      rulesByTags: { "alt-text,lang": 2, lang: 1, "structure,table": 3 },
    };
    const { categories } = scoreAccessibilityReport(report([], { checks }));
    const totals = Object.fromEntries(
      categories.map((c) => [c.id, c.rulesInProfile]),
    );
    expect(totals).toEqual({
      structure: 3,
      altText: 2,
      language: 1,
      metadata: 0,
      fonts: 0,
      links: 0,
    });
  });

  it("leaves totals unknown when the report does not count rules", () => {
    const { categories } = scoreAccessibilityReport(report([]));
    expect(categories.every((c) => c.rulesInProfile === undefined)).toBe(true);
  });
});
