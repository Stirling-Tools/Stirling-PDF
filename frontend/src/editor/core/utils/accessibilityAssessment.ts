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

export type AccessibilityBasicId =
  | "tagged"
  | "title"
  | "displaysTitle"
  | "language"
  | "fonts"
  | "declares"
  | "notEncrypted";

/** The area whose rules also catch each basic, so a basic failing there is reported only once. */
const BASIC_AREA: Record<AccessibilityBasicId, AccessibilityCategoryId | null> =
  {
    tagged: "structure",
    title: "metadata",
    displaysTitle: "metadata",
    language: "language",
    fonts: "fonts",
    declares: "metadata",
    notEncrypted: null,
  };

export interface AccessibilityBasic {
  id: AccessibilityBasicId;
  ok: boolean;
}

export interface AccessibilityAssessment {
  result: AccessibilityResult;
  /** Every area in display order; an area passes when it has no issues. */
  areas: AccessibilityArea[];
  /** Basics the breakdown does not already report: a failing basic is left out when its area fails. */
  basics: AccessibilityBasic[];
  /** The basics and areas above, together. */
  checks: { passed: number; total: number };
}

function documentBasics(report: AccessibilityReport): AccessibilityBasic[] {
  const { summary } = report;
  return [
    { id: "tagged", ok: report.tagged },
    { id: "title", ok: summary.hasTitle },
    { id: "displaysTitle", ok: summary.displaysDocTitle },
    { id: "language", ok: summary.hasLanguage },
    { id: "fonts", ok: summary.allFontsEmbedded },
    { id: "declares", ok: report.declaresConformance },
    { id: "notEncrypted", ok: !summary.encrypted },
  ];
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
  const failingIds = new Set(failing.map((area) => area.id));
  const basics = documentBasics(report).filter((basic) => {
    const area = BASIC_AREA[basic.id];
    return basic.ok || area === null || !failingIds.has(area);
  });
  const checks = {
    passed:
      basics.filter((basic) => basic.ok).length + areas.length - failing.length,
    total: basics.length + areas.length,
  };
  return { result, areas, basics, checks };
}
