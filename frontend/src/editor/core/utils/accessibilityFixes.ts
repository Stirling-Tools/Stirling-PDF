import type { AccessibilityIssue } from "@editor/types/checkAccessibility";
import type { PdfUaPart } from "@editor/tools/pdfTextEditor/pdfdoc/passes/conformanceClaim";
import { knownRuleKey } from "@editor/utils/accessibilityPlainLanguage";

/**
 * Where the editor fixes a failing rule. Page-scoped targets look from the report's
 * page on; the rest are document settings.
 */
export type AccessibilityFixTarget =
  /** The first item still to tag: text to type or mark decorative, or an image. */
  | "untagged"
  /** The first image still to describe, with its description field focused. */
  | "image"
  /** The first heading the outline flags, so its level can be changed. */
  | "heading"
  /** The first untagged link, with Tag link focused; tagging also writes its description. */
  | "link"
  /** The "Document is fully tagged" checkbox. */
  | "markedTagged";

export const PAGE_SCOPED_TARGETS: ReadonlySet<AccessibilityFixTarget> = new Set(
  ["untagged", "image", "heading", "link"],
);

/**
 * Rule keys (accessibilityPlainLanguage) the editor fixes, by where; a rule absent
 * gets no button.
 */
const FIX_TARGETS: Record<string, AccessibilityFixTarget> = {
  untaggedContent: "untagged",
  figureNoAlt: "image",
  headingSkipped: "heading",
  linkNotTagged: "link",
  linkNoDescription: "link",
  notMarkedTagged: "markedTagged",
};

/** Where the editor fixes `issue`; null when it cannot. */
export function fixTargetFor(
  issue: AccessibilityIssue,
): AccessibilityFixTarget | null {
  const key = knownRuleKey(issue);
  return key ? (FIX_TARGETS[key] ?? null) : null;
}

/** Rule keys a fresh declaration fixes: it is written under the prefix the standard requires. */
const CLAIM_RULES: ReadonlySet<string> = new Set([
  "noConformanceClaim",
  "conformancePrefix",
]);

/** The PDF/UA part whose declaration fixes `issue`; null when declaring does not. */
export function conformanceClaimFixFor(
  issue: AccessibilityIssue,
): PdfUaPart | null {
  const key = knownRuleKey(issue);
  return key && CLAIM_RULES.has(key) ? profilePart(issue.specification) : null;
}

/** The part a report's profile name, such as "PDF/UA-1", checks against. */
export function profilePart(
  profile: string | null | undefined,
): PdfUaPart | null {
  switch (profile) {
    case "PDF/UA-1":
      return 1;
    case "PDF/UA-2":
      return 2;
    default:
      return null;
  }
}
