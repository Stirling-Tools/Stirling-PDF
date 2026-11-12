import type { TFunction } from "i18next";
import type {
  AccessibilityIssue,
  AccessibilityReport,
} from "@editor/types/checkAccessibility";
import type {
  AccessibilityBasicId,
  AccessibilityCategoryId,
  AccessibilityResult,
} from "@editor/utils/accessibilityAssessment";
import {
  describeLocation,
  describeObject,
  explainRule,
  ruleTitle,
} from "@editor/utils/accessibilityPlainLanguage";

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
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = page;
    previous = page;
  }
  if (start !== undefined) {
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
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
      "Tags tell screen readers what each part of a page is, such as a heading, list or table, and the order to read it in.",
    ),
    altText: t(
      "checkAccessibility.categoryTip.altText",
      "Images need a short text description for screen readers to read out instead.",
    ),
    language: t(
      "checkAccessibility.categoryTip.language",
      "Screen readers need to know the document's language to pronounce it correctly.",
    ),
    metadata: t(
      "checkAccessibility.categoryTip.metadata",
      "The title, PDF/UA declaration and other settings that assistive technology reads from the file.",
    ),
    fonts: t(
      "checkAccessibility.categoryTip.fonts",
      "Fonts need to be in the file, with every character linked to real text, so the text can be read aloud and copied.",
    ),
    links: t(
      "checkAccessibility.categoryTip.links",
      "Links, comments and form fields need tags and descriptions, and a tab order that follows the page.",
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
      "Screen readers can read this document, but some checks fail.",
    ),
    fail: t(
      "checkAccessibility.result.failSummary",
      "Screen readers may not be able to read all of this document.",
    ),
  })[result];

export const basicLabel = (t: TFunction, id: AccessibilityBasicId) =>
  ({
    tagged: t("checkAccessibility.facts.tagged", "Tagged"),
    title: t("checkAccessibility.facts.title", "Has a title"),
    displaysTitle: t(
      "checkAccessibility.facts.displaysTitle",
      "Shows its title",
    ),
    language: t("checkAccessibility.facts.language", "Declares a language"),
    fonts: t("checkAccessibility.facts.fonts", "Fonts embedded"),
    declares: t("checkAccessibility.facts.declares", "Declares PDF/UA"),
    notEncrypted: t("checkAccessibility.facts.notEncrypted", "Not encrypted"),
  })[id];

export const basicTip = (t: TFunction, id: AccessibilityBasicId) =>
  ({
    tagged: t(
      "checkAccessibility.factTip.tagged",
      "The file has tags describing its structure. Without them, screen readers only get plain text.",
    ),
    title: t(
      "checkAccessibility.factTip.title",
      "The file has a title in its metadata.",
    ),
    displaysTitle: t(
      "checkAccessibility.factTip.displaysTitle",
      "PDF readers show the title, not the file name, when the file opens.",
    ),
    language: t(
      "checkAccessibility.factTip.language",
      "The file says which language its text is in.",
    ),
    fonts: t(
      "checkAccessibility.factTip.fonts",
      "Every font the text uses is included in the file.",
    ),
    declares: t(
      "checkAccessibility.factTip.declares",
      "The file's metadata says it follows PDF/UA.",
    ),
    notEncrypted: t(
      "checkAccessibility.factTip.notEncrypted",
      "The file isn't encrypted. Encryption can stop assistive technology reading it.",
    ),
  })[id];

/**
 * The clauses each row covers, from the veraPDF rules the row groups. Must follow
 * TAG_PRECEDENCE and BASIC_AREA in accessibilityAssessment, which decide that grouping.
 */
const AREA_CLAUSES: Record<string, Record<AccessibilityCategoryId, string>> = {
  "PDF/UA-1": {
    structure: "7.1, 7.4, 7.5, 7.9",
    altText: "7.3, 7.7",
    language: "7.2",
    metadata: "5, 6.2, 7.1",
    fonts: "7.21",
    links: "7.18",
  },
  "PDF/UA-2": {
    structure: "8.2",
    altText: "8.2.5.28, 8.4.3",
    language: "8.4.4",
    metadata: "5, 6.2, 8.11",
    fonts: "8.4.5",
    links: "8.9, 8.10",
  },
};

const BASIC_CLAUSES: Record<
  string,
  Partial<Record<AccessibilityBasicId, string>>
> = {
  "PDF/UA-1": {
    tagged: "7.1",
    title: "7.1",
    displaysTitle: "7.1",
    language: "7.2",
    fonts: "7.21.4",
    declares: "5",
    notEncrypted: "7.16",
  },
  "PDF/UA-2": {
    tagged: "8.2.1",
    title: "8.11.1",
    displaysTitle: "8.11.2",
    language: "8.4.4",
    fonts: "8.4.5.5",
    declares: "5",
  },
};

function clauseReference(
  t: TFunction,
  profile: string,
  clauses: string | undefined,
): string | null {
  return clauses
    ? t("checkAccessibility.clauseRef", "{{profile}} §{{clauses}}", {
        profile,
        clauses,
      })
    : null;
}

/** e.g. "PDF/UA-1 §7.21"; null for a profile the tool has no clause list for. */
export const categoryReference = (
  t: TFunction,
  profile: string,
  id: AccessibilityCategoryId,
) => clauseReference(t, profile, AREA_CLAUSES[profile]?.[id]);

export const basicReference = (
  t: TFunction,
  profile: string,
  id: AccessibilityBasicId,
) => clauseReference(t, profile, BASIC_CLAUSES[profile]?.[id]);

export const checksLabel = (
  t: TFunction,
  checks: { passed: number; total: number },
) =>
  t(
    "checkAccessibility.checks.label",
    "{{passed}} of {{total}} checks passed",
    checks,
  );

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
  /** Where the issue was found and how often, e.g. "Pages 1-3 - 12 instances"; null when unknown. */
  summary: string | null;
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
  // Tag-tree elements and document-level rules have no page, so an empty list says nothing.
  const where =
    pages.length === 0
      ? null
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
  const instances =
    issue.occurrences > 1
      ? t("checkAccessibility.issue.instances", "{{count}} instances", {
          count: issue.occurrences,
        })
      : null;
  const summary =
    [where, instances].filter((part) => part !== null).join(" - ") || null;
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
  if (issue.occurrences === 1 && issue.location) {
    details.push({
      label: t("checkAccessibility.issue.where", "Where"),
      value: describeLocation(t, issue.location),
    });
  } else if (pages.length > 0) {
    details.push({
      label: t("checkAccessibility.issue.pages", "Pages"),
      value: pagesPartial
        ? t(
            "checkAccessibility.issue.pagesPartialValue",
            "{{pages}} (only the first occurrences record a page, so this list may be incomplete)",
            { pages: pageList },
          )
        : pageList,
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
