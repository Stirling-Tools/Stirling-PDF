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

export type AccessibilityGrade = "pass" | "minor" | "needsWork" | "poor";

export interface AccessibilityCategoryResult {
  id: AccessibilityCategoryId;
  weight: number;
  /** Points earned out of `weight`, before the untagged penalty. */
  points: number;
  issues: AccessibilityIssue[];
  /** Rules the profile defines in this category; undefined when the report does not say. */
  rulesInProfile?: number;
}

export interface AccessibilityScore {
  /** 0-100, rounded. */
  score: number;
  grade: AccessibilityGrade;
  categories: AccessibilityCategoryResult[];
  untaggedPenaltyApplied: boolean;
}

/** Display order; the weights sum to 100. */
export const ACCESSIBILITY_CATEGORIES: ReadonlyArray<{
  id: AccessibilityCategoryId;
  weight: number;
}> = [
  { id: "structure", weight: 30 },
  { id: "altText", weight: 20 },
  { id: "language", weight: 15 },
  { id: "metadata", weight: 15 },
  { id: "fonts", weight: 10 },
  { id: "links", weight: 10 },
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

/**
 * Without a structure tree veraPDF has no headings, tables or figures to check, so those
 * rules pass vacuously; halving the score keeps an untagged file from looking accessible.
 */
const UNTAGGED_MULTIPLIER = 0.5;

export function categoryOf(issue: AccessibilityIssue): AccessibilityCategoryId {
  return categoryOfTags(issue.tags ?? []);
}

function categoryOfTags(tags: readonly string[]): AccessibilityCategoryId {
  for (const { category, tags: matching } of TAG_PRECEDENCE) {
    if (tags.some((tag) => matching.includes(tag))) return category;
  }
  return "structure";
}

export function gradeOf(score: number, passes: boolean): AccessibilityGrade {
  if (passes && score === 100) return "pass";
  if (score >= 80) return "minor";
  if (score >= 50) return "needsWork";
  return "poor";
}

function countRulesByCategory(
  rulesByTags: Record<string, number> | undefined,
): Map<AccessibilityCategoryId, number> | undefined {
  if (!rulesByTags) return undefined;
  const counts = new Map<AccessibilityCategoryId, number>();
  for (const [tags, rules] of Object.entries(rulesByTags)) {
    const category = categoryOfTags(tags.split(",").filter(Boolean));
    counts.set(category, (counts.get(category) ?? 0) + rules);
  }
  return counts;
}

/**
 * Scores failing rules, not failed checks, which scale with page count. Each category earns
 * weight / (1 + failing rules): half on the first failure, nearing zero as more fail.
 */
export function scoreAccessibilityReport(
  report: AccessibilityReport,
): AccessibilityScore {
  const issuesByCategory = new Map<
    AccessibilityCategoryId,
    AccessibilityIssue[]
  >();
  for (const issue of report.issues) {
    const category = categoryOf(issue);
    issuesByCategory.set(category, [
      ...(issuesByCategory.get(category) ?? []),
      issue,
    ]);
  }

  const rulesByCategory = countRulesByCategory(report.checks?.rulesByTags);
  const categories = ACCESSIBILITY_CATEGORIES.map(({ id, weight }) => {
    const issues = issuesByCategory.get(id) ?? [];
    return {
      id,
      weight,
      points: weight / (1 + issues.length),
      issues,
      rulesInProfile: rulesByCategory
        ? (rulesByCategory.get(id) ?? 0)
        : undefined,
    };
  });

  const raw = categories.reduce((sum, category) => sum + category.points, 0);
  const untaggedPenaltyApplied = !report.tagged;
  const score = Math.round(
    untaggedPenaltyApplied ? raw * UNTAGGED_MULTIPLIER : raw,
  );

  return {
    score,
    grade: gradeOf(score, report.passesAutomatedChecks),
    categories,
    untaggedPenaltyApplied,
  };
}
