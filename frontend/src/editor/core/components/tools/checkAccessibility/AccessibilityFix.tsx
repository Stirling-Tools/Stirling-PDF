import { createContext, useContext, useId } from "react";
import { Tooltip } from "@mantine/core";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import type { AccessibilityIssue } from "@editor/types/checkAccessibility";
import {
  MarkedTaggedCaution,
  useMarkedTagged,
} from "@editor/components/tools/checkAccessibility/MarkedTaggedFix";
import {
  reviewMode,
  useReviewMode,
  useReviewing,
} from "@editor/tools/pdfTextEditor/store/reviewMode";
import {
  PAGE_SCOPED_TARGETS,
  fixTargetFor,
  type AccessibilityFixTarget,
} from "@editor/utils/accessibilityFixes";

/**
 * Opens the checked file in the review at `target`, from a 1-based page (or the
 * first). A null target opens the file without looking for anything to fix.
 */
export type AccessibilityFixFn = (
  target: AccessibilityFixTarget | null,
  page?: number,
) => void;

/** Null where the report cannot hand its file over to a review. */
export const AccessibilityFixContext = createContext<AccessibilityFixFn | null>(
  null,
);

/**
 * The report's main call to action: shows the tagging tool on the page, at what
 * it found to fix, or at the start for a file that passes. While the tool shows,
 * the same button hides it.
 */
export function FixInDocumentButton({
  passing,
  className,
}: {
  passing: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const fix = useContext(AccessibilityFixContext);
  const reviewing = useReviewing();
  if (!fix) return null;
  if (reviewing)
    return (
      <Button
        className={className}
        variant="secondary"
        leftSection={<Icon name="eye-off" size={16} />}
        onClick={() => reviewMode.requestClose()}
        data-testid="a11y-pause-fixing"
      >
        {t("checkAccessibility.fix.hide", "Hide tagging tool")}
      </Button>
    );
  return (
    <Button
      className={className}
      variant="primary"
      leftSection={<Icon name="universal-access" size={16} />}
      // A passing file has nothing to find, and looking reads every page first.
      onClick={() => fix(passing ? null : "untagged")}
      data-testid="a11y-fix-in-document"
    >
      {t("checkAccessibility.fix.show", "Show tagging tool")}
    </Button>
  );
}

/**
 * Tags every page of the file automatically in the review, as one undo step.
 * Shows how far it has got while it runs.
 */
export function TagEverythingButton({
  onTag,
  className,
}: {
  onTag: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { autoTagProgress } = useReviewMode();
  const percent = autoTagProgress
    ? Math.round(
        (autoTagProgress.current / Math.max(1, autoTagProgress.total)) * 100,
      )
    : null;
  return (
    <Tooltip
      multiline
      w={280}
      position="top"
      openDelay={400}
      label={t(
        "pdfTextEditor.inspector.accessibility.tagUntaggedHint",
        "Automatically adds accessibility tags throughout the document. The result is rough: check headings, lists and reading order afterwards.",
      )}
    >
      <Button
        className={className}
        variant="secondary"
        leftSection={<Icon name="sparkles" size={16} />}
        loading={percent !== null}
        disabled={percent !== null}
        onClick={onTag}
        data-testid="a11y-tag-everything"
      >
        {percent === null
          ? t("checkAccessibility.fix.tagEverything", "Auto-tag")
          : t("checkAccessibility.fix.tagging", {
              defaultValue: "Tagging... {{percent}}%",
              percent,
            })}
      </Button>
    </Tooltip>
  );
}

/**
 * Whether the report shown still finds untagged content. Readers that honour the
 * tagged flag read only the tags, so the flag's fix says what it would hide.
 */
export const UntaggedContentContext = createContext(false);

/** The editor's fix for `issue`; nothing when the editor cannot fix it. */
export function IssueFixButton({ issue }: { issue: AccessibilityIssue }) {
  const { t } = useTranslation();
  const fix = useContext(AccessibilityFixContext);
  const untaggedLeft = useContext(UntaggedContentContext);
  const markedTagged = useMarkedTagged();
  const cautionId = useId();
  const target = fixTargetFor(issue);
  if (!fix || !target) return null;
  const page = PAGE_SCOPED_TARGETS.has(target) ? issue.pages?.[0] : undefined;
  const flag = target === "markedTagged" ? markedTagged : null;
  const caution = target === "markedTagged" && untaggedLeft;
  const button = (
    <Button
      size="sm"
      variant="secondary"
      leftSection={
        <Icon name={flag?.marked ? "check" : "locate-fixed"} size={14} />
      }
      disabled={flag ? flag.marked || !flag.editable : false}
      onClick={() => (flag ? flag.set(true) : fix(target, page))}
      aria-describedby={caution ? cautionId : undefined}
      data-testid="a11y-fix-issue"
      data-fix={target}
    >
      {flag?.marked
        ? t("checkAccessibility.fix.markedTaggedDone", "Marked as tagged")
        : fixLabel(t, target, page)}
    </Button>
  );
  if (!caution) return button;
  return (
    <div className="a11y-issue__fix">
      {button}
      <MarkedTaggedCaution id={cautionId} testId="a11y-fix-caution" />
    </div>
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
    case "markedTagged":
      return t(
        "checkAccessibility.fix.markedTagged",
        "Mark the document as tagged",
      );
  }
}
