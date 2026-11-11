import type {
  AccessibilityIssue,
  AccessibilityReport,
} from "@editor/types/checkAccessibility";

export type AccessibilityCategoryId =
  | "structure"
  | "altText"
  | "language"
  | "fonts"
  | "links"
  | "metadata";

/** Display order. */
const CATEGORY_ORDER: readonly AccessibilityCategoryId[] = [
  "structure",
  "altText",
  "language",
  "metadata",
  "fonts",
  "links",
];

/**
 * Rules carry several tags, so each goes to the first category its tags match. Order matters: the
 * language of alternative text is an alt-text problem before it is a language one.
 */
const TAG_PRECEDENCE: ReadonlyArray<{
  category: AccessibilityCategoryId;
  tags: readonly string[];
}> = [
  { category: "altText", tags: ["alt-text", "figure"] },
  { category: "language", tags: ["lang"] },
  { category: "fonts", tags: ["font"] },
  { category: "links", tags: ["annotation"] },
  {
    category: "structure",
    tags: ["structure", "table", "list", "heading", "toc", "note", "artifact"],
  },
  { category: "metadata", tags: ["metadata", "syntax", "page"] },
];

/** Failures here keep screen readers from the content itself, not just from details about it. */
const BLOCKING_CATEGORIES: ReadonlySet<AccessibilityCategoryId> = new Set([
  "structure",
  "altText",
]);

export function categoryOf(issue: AccessibilityIssue): AccessibilityCategoryId {
  const tags = issue.tags ?? [];
  for (const { category, tags: matching } of TAG_PRECEDENCE) {
    if (tags.some((tag) => matching.includes(tag))) return category;
  }
  return "structure";
}

export type AccessibilityResult = "pass" | "partial" | "fail";

export interface AccessibilityArea {
  id: AccessibilityCategoryId;
  issues: AccessibilityIssue[];
}

export interface AccessibilityAssessment {
  result: AccessibilityResult;
  /** Every area in display order; an area passes when it has no issues. */
  areas: AccessibilityArea[];
}

/**
 * Fail when the file is untagged or a blocking area fails, since screen readers may then miss
 * content. Pass only when nothing fails and veraPDF agrees; anything else is partial.
 */
export function assessAccessibilityReport(
  report: AccessibilityReport,
): AccessibilityAssessment {
  const areas = CATEGORY_ORDER.map((id) => ({
    id,
    issues: report.issues.filter((issue) => categoryOf(issue) === id),
  }));
  const failing = areas.filter((area) => area.issues.length > 0);
  const result: AccessibilityResult =
    !report.tagged || failing.some((area) => BLOCKING_CATEGORIES.has(area.id))
      ? "fail"
      : failing.length === 0 && report.passesAutomatedChecks
        ? "pass"
        : "partial";
  return { result, areas };
}
