import type { AccessibilityIssue } from "@editor/types/checkAccessibility";
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
