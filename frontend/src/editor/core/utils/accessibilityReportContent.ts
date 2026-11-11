import type { TFunction } from "i18next";
import type {
  AccessibilityIssue,
  AccessibilityReport,
} from "@editor/types/checkAccessibility";
import type {
  AccessibilityCategoryId,
  AccessibilityResult,
} from "@editor/utils/accessibilityAssessment";
import {
  describeLocation,
  describeObject,
  explainRule,
  ruleTitle,
} from "@editor/utils/accessibilityPlainEnglish";

/**
 * The words of an accessibility report, shared by the on-screen report and its PDF so the two
 * always say the same thing.
 */

/** "1, 2, 3, 5, 7, 8" -> "1-3, 5, 7-8". Input must be sorted ascending. */
export function formatPageRanges(pages: number[]): string {
  const ranges: string[] = [];
  let start = pages[0];
  let previous = pages[0];
  for (const page of pages.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    ranges.push(start === previous ? `${start}` : `${start}–${previous}`);
    start = page;
    previous = page;
  }
  if (start !== undefined) {
    ranges.push(start === previous ? `${start}` : `${start}–${previous}`);
  }
  return ranges.join(", ");
}

export const categoryLabel = (t: TFunction, id: AccessibilityCategoryId) =>
  ({
    structure: t("checkAccessibility.category.structure", "Tags & structure"),
    altText: t("checkAccessibility.category.altText", "Alternative text"),
    language: t("checkAccessibility.category.language", "Language"),
    metadata: t("checkAccessibility.category.metadata", "Metadata & settings"),
    fonts: t("checkAccessibility.category.fonts", "Fonts"),
    links: t("checkAccessibility.category.links", "Links & annotations"),
  })[id];

export const categoryTip = (t: TFunction, id: AccessibilityCategoryId) =>
  ({
    structure: t(
      "checkAccessibility.categoryTip.structure",
      "Whether the content is tagged so screen readers can follow it: headings, paragraphs, lists, tables and reading order, with decoration marked so it is skipped.",
    ),
    altText: t(
      "checkAccessibility.categoryTip.altText",
      "Whether images and other non-text content have descriptions a screen reader can read out.",
    ),
    language: t(
      "checkAccessibility.categoryTip.language",
      "Whether the document says what language its text is in, so screen readers pronounce it correctly.",
    ),
    metadata: t(
      "checkAccessibility.categoryTip.metadata",
      "Whether the file has a title, shows it when opened, declares PDF/UA, and has the settings assistive technology relies on.",
    ),
    fonts: t(
      "checkAccessibility.categoryTip.fonts",
      "Whether fonts are included in the file and every character maps to real text, so it can be read aloud, searched and copied.",
    ),
    links: t(
      "checkAccessibility.categoryTip.links",
      "Whether links, comments and form fields are tagged and described, and reached in a sensible tab order.",
    ),
  })[id];

export const resultLabel = (t: TFunction, result: AccessibilityResult) =>
  ({
    pass: t("checkAccessibility.result.pass", "Pass"),
    partial: t("checkAccessibility.result.partial", "Partial"),
    fail: t("checkAccessibility.result.fail", "Fail"),
  })[result];

export const resultSummary = (t: TFunction, result: AccessibilityResult) =>
  ({
    pass: t(
      "checkAccessibility.result.passSummary",
      "Passes every automated PDF/UA check.",
    ),
    partial: t(
      "checkAccessibility.result.partialSummary",
      "Screen readers can read it, but some checks fail.",
    ),
    fail: t(
      "checkAccessibility.result.failSummary",
      "Screen readers may not be able to read all of it.",
    ),
  })[result];

export interface AccessibilityFact {
  ok: boolean;
  label: string;
}

export function documentBasics(
  t: TFunction,
  report: AccessibilityReport,
): AccessibilityFact[] {
  const { summary } = report;
  return [
    {
      ok: report.tagged,
      label: t("checkAccessibility.facts.tagged", "Tagged"),
    },
    {
      ok: summary.hasTitle,
      label: t("checkAccessibility.facts.title", "Has a title"),
    },
    {
      ok: summary.displaysDocTitle,
      label: t("checkAccessibility.facts.displaysTitle", "Shows its title"),
    },
    {
      ok: summary.hasLanguage,
      label: t("checkAccessibility.facts.language", "Declares a language"),
    },
    {
      ok: summary.allFontsEmbedded,
      label: t("checkAccessibility.facts.fonts", "Fonts embedded"),
    },
    {
      ok: report.declaresConformance,
      label: t("checkAccessibility.facts.declares", "Declares PDF/UA"),
    },
    {
      ok: !summary.encrypted,
      label: t("checkAccessibility.facts.notEncrypted", "Not encrypted"),
    },
  ];
}

export function figuresSummary(
  t: TFunction,
  report: AccessibilityReport,
): string | null {
  const figures = report.figuresNeedingDescription;
  if (figures.length === 0) return null;
  const pages = [...new Set(figures.map((figure) => figure.page))].sort(
    (a, b) => a - b,
  );
  return t(
    "checkAccessibility.figures.summary",
    "{{count}} images need a description (pages {{pages}})",
    {
      count: figures.length,
      pages: formatPageRanges(pages),
    },
  );
}

export interface IssueDetail {
  label: string;
  value: string;
}

export interface IssueContent {
  title: string;
  /** Where the issue was found and how often, e.g. "Pages 1–3 · 12 times". */
  summary: string;
  explanation: string | null;
  details: IssueDetail[];
}

export function describeIssue(
  t: TFunction,
  issue: AccessibilityIssue,
): IssueContent {
  const reportedTitle =
    issue.errorMessage?.trim() || issue.technicalMessage || issue.message;
  const plainTitle = ruleTitle(t, issue);
  const pages = issue.pages ?? [];
  const pageList = formatPageRanges(pages);
  // The validator records pages for only some occurrences of a frequent failure.
  const pagesPartial = issue.pagesComplete === false;
  const where =
    pages.length === 0
      ? t("checkAccessibility.issue.documentLevel", "Whole document")
      : pagesPartial
        ? t(
            "checkAccessibility.issue.onPagesPartial",
            "Pages {{pages}} (list may be incomplete)",
            { pages: pageList, count: pages.length },
          )
        : t("checkAccessibility.issue.onPages", "Pages {{pages}}", {
            pages: pageList,
            count: pages.length,
          });
  const summary =
    issue.occurrences > 1
      ? `${where} · ${t("checkAccessibility.issue.times", "{{count}} times", {
          count: issue.occurrences,
        })}`
      : where;
  const plainExplanation = explainRule(t, issue);
  const requirement =
    issue.technicalMessage && issue.technicalMessage !== reportedTitle
      ? issue.technicalMessage
      : null;

  const details: IssueDetail[] = [
    {
      label: t("checkAccessibility.issue.rule", "Rule"),
      value: t(
        "checkAccessibility.issue.clauseValue",
        "{{spec}} §{{clause}}, test {{test}}",
        {
          spec: issue.specification ?? "",
          clause: issue.clause,
          test: issue.testNumber,
        },
      ),
    },
  ];
  if (issue.object) {
    details.push({
      label: t("checkAccessibility.issue.appliesTo", "Applies to"),
      value: describeObject(t, issue.object),
    });
  }
  if (issue.occurrences > 1 || !issue.location) {
    details.push({
      label: t("checkAccessibility.issue.pages", "Pages"),
      value:
        pages.length === 0
          ? t("checkAccessibility.issue.documentLevel", "Whole document")
          : pagesPartial
            ? t(
                "checkAccessibility.issue.pagesPartialValue",
                "{{pages}} (only the first occurrences record a page, so this list may be incomplete)",
                { pages: pageList },
              )
            : pageList,
    });
  } else {
    details.push({
      label: t("checkAccessibility.issue.where", "Where"),
      value: describeLocation(t, issue.location),
    });
  }
  if (plainTitle) {
    details.push({
      label: t("checkAccessibility.issue.reportedAs", "Reported as"),
      value: reportedTitle,
    });
  }
  if (plainExplanation && requirement) {
    details.push({
      label: t("checkAccessibility.issue.requirement", "Requirement"),
      value: requirement,
    });
  }
  if (issue.references && issue.references.length > 0) {
    details.push({
      label: t("checkAccessibility.issue.standard", "Standard"),
      value: issue.references.join("; "),
    });
  }

  return {
    title: plainTitle ?? reportedTitle,
    summary,
    explanation: plainExplanation ?? requirement,
    details,
  };
}
