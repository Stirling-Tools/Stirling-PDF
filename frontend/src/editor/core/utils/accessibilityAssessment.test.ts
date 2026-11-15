// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assessAccessibilityReport,
  categoryOf,
} from "@editor/utils/accessibilityAssessment";
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
  it("puts the language of alternative text under language", () => {
    expect(categoryOf(issue("7.2", ["lang", "alt-text"]))).toBe("language");
  });

  it("puts a missing annotation description under links", () => {
    expect(categoryOf(issue("7.18.1", ["annotation", "alt-text"]))).toBe(
      "links",
    );
  });

  it("puts tab order under links", () => {
    expect(categoryOf(issue("7.18.3", ["page"]))).toBe("links");
  });

  it("puts a PDF/UA-2 figure nesting rule under structure", () => {
    expect(
      categoryOf(issue("Table 5. TR-Figure", ["structure", "figure"])),
    ).toBe("structure");
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

describe("assessAccessibilityReport", () => {
  it("passes a tagged file with no failing rules", () => {
    const { result, areas } = assessAccessibilityReport(report([]));
    expect(result).toBe("pass");
    expect(areas.every((area) => area.issues.length === 0)).toBe(true);
  });

  it("fails when screen readers may miss content", () => {
    expect(
      assessAccessibilityReport(report([issue("7.1", ["structure"])])).result,
    ).toBe("fail");
    expect(
      assessAccessibilityReport(report([issue("7.3", ["alt-text"])])).result,
    ).toBe("fail");
    expect(
      assessAccessibilityReport(report([], { tagged: false })).result,
    ).toBe("fail");
  });

  it("is partial when veraPDF reports a failure no rule explains", () => {
    expect(
      assessAccessibilityReport(report([], { passesAutomatedChecks: false }))
        .result,
    ).toBe("partial");
  });

  it("is partial when a basic fails though no rule does", () => {
    expect(
      assessAccessibilityReport(
        report([], { summary: { ...report([]).summary, encrypted: true } }),
      ).result,
    ).toBe("partial");
  });

  it("is partial when only other areas fail", () => {
    const { result, areas } = assessAccessibilityReport(
      report([issue("7.1", ["metadata"]), issue("7.21", ["font"])]),
    );
    expect(result).toBe("partial");
    expect(
      areas.filter((area) => area.issues.length > 0).map((area) => area.id),
    ).toEqual(["metadata", "fonts"]);
  });

  it("counts every basic and area when nothing overlaps", () => {
    expect(assessAccessibilityReport(report([])).checks).toEqual({
      passed: 13,
      total: 13,
    });
  });

  it("leaves out a failing basic its failing area already counts", () => {
    const { checks, basics } = assessAccessibilityReport(
      report([issue("7.1", ["structure"]), issue("7.1", ["metadata"])], {
        tagged: false,
        summary: { ...report([]).summary, hasTitle: false },
      }),
    );
    expect(basics.map((basic) => basic.id)).not.toContain("tagged");
    expect(basics.map((basic) => basic.id)).not.toContain("title");
    expect(checks).toEqual({ passed: 9, total: 11 });
  });

  it("counts a failing basic whose area passes", () => {
    const { checks } = assessAccessibilityReport(
      report([], { summary: { ...report([]).summary, hasLanguage: false } }),
    );
    expect(checks).toEqual({ passed: 12, total: 13 });
  });
});
