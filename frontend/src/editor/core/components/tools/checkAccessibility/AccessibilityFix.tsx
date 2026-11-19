import { createContext, useContext } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import type { AccessibilityIssue } from "@editor/types/checkAccessibility";
import {
  PAGE_SCOPED_TARGETS,
  fixTargetFor,
  type AccessibilityFixTarget,
} from "@editor/utils/accessibilityFixes";

/**
 * Opens the checked file in the review at `target`, from a 1-based page (or the
 * first). Null where the report cannot hand its file over.
 */
export type AccessibilityFixFn = (
  target: AccessibilityFixTarget,
  page?: number,
) => void;

export const AccessibilityFixContext = createContext<AccessibilityFixFn | null>(
  null,
);

/**
 * The report's main call to action: fix what it found, on the page. A file
 * that passes has nothing to fix, so the same button offers to view its tags.
 */
export function FixInDocumentButton({ passing }: { passing: boolean }) {
  const { t } = useTranslation();
  const fix = useContext(AccessibilityFixContext);
  if (!fix) return null;
  return (
    <Button
      fullWidth
      variant="primary"
      leftSection={<Icon name="universal-access" size={16} />}
      onClick={() => fix("untagged")}
      data-testid="a11y-fix-in-document"
    >
      {passing
        ? t(
            "checkAccessibility.fix.viewInDocument",
            "View tags in the document",
          )
        : t("checkAccessibility.fix.inDocument", "Fix tags in the document")}
    </Button>
  );
}

/** The editor's fix for `issue`; nothing when the editor cannot fix it. */
export function IssueFixButton({ issue }: { issue: AccessibilityIssue }) {
  const { t } = useTranslation();
  const fix = useContext(AccessibilityFixContext);
  const target = fixTargetFor(issue);
  if (!fix || !target) return null;
  const page = PAGE_SCOPED_TARGETS.has(target) ? issue.pages?.[0] : undefined;
  return (
    <Button
      size="sm"
      variant="secondary"
      leftSection={<Icon name="locate-fixed" size={14} />}
      onClick={() => fix(target, page)}
      data-testid="a11y-fix-issue"
      data-fix={target}
    >
      {fixLabel(t, target, page)}
    </Button>
  );
}

function fixLabel(
  t: TFunction,
  target: AccessibilityFixTarget,
  page: number | undefined,
): string {
  const onPage = page !== undefined;
  switch (target) {
    case "untagged":
      return onPage
        ? t(
            "checkAccessibility.fix.untaggedOnPage",
            "Tag content on page {{page}}",
            { page },
          )
        : t("checkAccessibility.fix.untagged", "Tag the content");
    case "image":
      return onPage
        ? t(
            "checkAccessibility.fix.imageOnPage",
            "Describe the image on page {{page}}",
            { page },
          )
        : t("checkAccessibility.fix.image", "Describe the images");
    case "heading":
      return onPage
        ? t(
            "checkAccessibility.fix.headingOnPage",
            "Fix the heading on page {{page}}",
            { page },
          )
        : t("checkAccessibility.fix.heading", "Fix the headings");
    case "link":
      return onPage
        ? t(
            "checkAccessibility.fix.linkOnPage",
            "Tag the link on page {{page}}",
            { page },
          )
        : t("checkAccessibility.fix.link", "Tag the links");
    case "documentLanguage":
      return t(
        "checkAccessibility.fix.documentLanguage",
        "Set the document language",
      );
    case "markedTagged":
      return t(
        "checkAccessibility.fix.markedTagged",
        "Mark the document as tagged",
      );
  }
}
