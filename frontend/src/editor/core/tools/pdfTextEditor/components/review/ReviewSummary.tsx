import { useTranslation } from "react-i18next";
import { Checkbox } from "@editor/ui/Checkbox";
import { ProgressBar } from "@editor/ui/ProgressBar";
import { SectionHeader } from "@editor/ui/SectionHeader";
import { StatRow } from "@editor/tools/pdfTextEditor/components/inspector/InspectorPrimitives";
import { HeadingOutlineSection } from "@editor/tools/pdfTextEditor/components/inspector/HeadingOutlineSection";
import type { AccessibilityProgress } from "@editor/tools/pdfTextEditor/util/accessibilityProgress";
import type { AccessibilityReview } from "@editor/tools/pdfTextEditor/util/accessibilityReview";
import type { HeadingOutline } from "@editor/tools/pdfTextEditor/util/headingOutline";
import "@editor/tools/pdfTextEditor/components/review/ReviewSummary.css";

export interface ReviewSummaryProps {
  progress: Pick<AccessibilityProgress, "done" | "total" | "complete">;
  /** Images and text needing attention; null when the file is not treated as tagged. */
  review: AccessibilityReview | null;
  /** Read pages with content left untagged. */
  untaggedPages: number;
  /** Whether the file declares itself tagged; null when that can't be changed. */
  markedTagged: boolean | null;
  onSetMarkedTagged: (marked: boolean) => void;
  /** Whether the saved file will hold any tags. */
  hasTags: boolean;
  /** Null when there is nothing to check. */
  headingOutline: HeadingOutline | null;
  onSelectHeading: (index: number) => void;
}

/** What the review knows about the whole document, live as it is tagged: progress, what is left, headings. */
export function ReviewSummary({
  progress,
  review,
  untaggedPages,
  markedTagged,
  onSetMarkedTagged,
  hasTags,
  headingOutline,
  onSelectHeading,
}: ReviewSummaryProps) {
  const { t } = useTranslation();
  return (
    <div className="review-summary" data-testid="pdf-editor-review-summary">
      <section className="review-summary__section">
        <SectionHeader
          title={t("pdfTextEditor.review.summary.title", "Tagging")}
          count={`${progress.done}/${progress.total}`}
        />
        <TaggingProgress {...progress} />
        {review && (
          <div
            className="review-summary__rows"
            data-testid="pdf-editor-document-accessibility-summary"
          >
            <StatRow
              label={t(
                "pdfTextEditor.inspector.accessibility.missingDescriptions",
                "Missing descriptions",
              )}
              value={review.needsDescription}
            />
            <StatRow
              label={t(
                "pdfTextEditor.inspector.accessibility.untaggedImages",
                "Untagged images",
              )}
              value={review.untagged}
            />
            {review.untaggable > 0 && (
              <StatRow
                label={t(
                  "pdfTextEditor.inspector.accessibility.untaggableImages",
                  "Can't be tagged here",
                )}
                value={review.untaggable}
              />
            )}
            <StatRow
              label={t(
                "pdfTextEditor.inspector.accessibility.untaggedPages",
                "Pages to tag",
              )}
              value={untaggedPages}
            />
          </div>
        )}
        <MarkedTaggedCheckbox
          marked={markedTagged}
          onChange={onSetMarkedTagged}
          untaggedPages={untaggedPages}
          hasTags={hasTags}
        />
      </section>
      {headingOutline && (
        <section className="review-summary__section">
          <SectionHeader
            title={t(
              "pdfTextEditor.inspector.accessibility.outline.heading",
              "Headings",
            )}
          />
          <HeadingOutlineSection
            outline={headingOutline}
            onSelect={onSelectHeading}
          />
        </section>
      )}
    </div>
  );
}

function TaggingProgress({
  done,
  total,
  complete,
}: ReviewSummaryProps["progress"]) {
  const { t } = useTranslation();
  const left = total - done;
  const finished = total > 0 && left === 0;
  return (
    <div
      className="review-summary__progress"
      data-testid="pdf-editor-review-score"
    >
      <ProgressBar
        value={total === 0 ? 0 : done / total}
        color={finished ? "var(--c-success)" : undefined}
        label={t("pdfTextEditor.review.summary.progress", "Tagging progress")}
      />
      <span className="review-summary__caption">
        {finished
          ? t("pdfTextEditor.review.allDone", "All text and images are tagged")
          : t("pdfTextEditor.review.left", "{{count}} left to tag", {
              count: left,
            })}
        {!complete &&
          ` - ${t("pdfTextEditor.review.counting", "still counting")}`}
      </span>
    </div>
  );
}

/**
 * The file's claim to be tagged, which readers that honour it read the tags
 * by. Separate from the tags so a half-tagged file does not make the rest of
 * its content unreadable. Absent when the file's flag can't be changed.
 */
function MarkedTaggedCheckbox({
  marked,
  onChange,
  untaggedPages,
  hasTags,
}: {
  marked: boolean | null;
  onChange: (marked: boolean) => void;
  untaggedPages: number;
  hasTags: boolean;
}) {
  const { t } = useTranslation();
  if (marked === null) return null;
  const warning = marked
    ? untaggedPages > 0 &&
      t(
        "pdfTextEditor.inspector.accessibility.markedWithUntagged",
        "Some content has no tags, so screen readers may skip it.",
      )
    : hasTags &&
      t(
        "pdfTextEditor.inspector.accessibility.unmarkedWithTags",
        "Some PDF viewers will use the tags anyway and may skip content without them.",
      );
  return (
    <div className="review-summary__marked" data-fix-target="markedTagged">
      <Checkbox
        checked={marked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        label={t(
          "pdfTextEditor.inspector.accessibility.markedTagged",
          "Document is fully tagged",
        )}
        description={t(
          "pdfTextEditor.inspector.accessibility.markedTaggedHint",
          "Tells PDF readers to use the accessibility tags. Tick it once everything is tagged.",
        )}
        data-testid="pdf-editor-document-accessibility-marked"
      />
      {warning && (
        <p
          className="review-summary__warning"
          data-testid="pdf-editor-document-accessibility-marked-warning"
        >
          {warning}
        </p>
      )}
    </div>
  );
}
