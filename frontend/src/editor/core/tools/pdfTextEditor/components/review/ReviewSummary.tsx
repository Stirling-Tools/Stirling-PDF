import { useTranslation } from "react-i18next";
import { Chip } from "@editor/ui/Chip";
import { Icon, type IconName } from "@editor/ui/Icon";
import { ProgressBar } from "@editor/ui/ProgressBar";
import { SectionHeader } from "@editor/ui/SectionHeader";
import { HeadingOutlineSection } from "@editor/tools/pdfTextEditor/components/inspector/HeadingOutlineSection";
import type { AccessibilityProgress } from "@editor/tools/pdfTextEditor/util/accessibilityProgress";
import type { AccessibilityReview } from "@editor/tools/pdfTextEditor/util/accessibilityReview";
import {
  issueCount,
  type HeadingOutline,
} from "@editor/tools/pdfTextEditor/util/headingOutline";
import "@editor/tools/pdfTextEditor/components/review/ReviewSummary.css";

export interface ReviewSummaryProps {
  progress: Pick<AccessibilityProgress, "done" | "total" | "complete">;
  /** Images and text needing attention; null when the file is not treated as tagged. */
  review: AccessibilityReview | null;
  /** Read pages with content left untagged. */
  untaggedPages: number;
  /** Null when there is nothing to check. */
  headingOutline: HeadingOutline | null;
  onSelectHeading: (index: number) => void;
}

/** What the review knows about the whole document, live as it is tagged: progress, what is left, headings. */
export function ReviewSummary({
  progress,
  review,
  untaggedPages,
  headingOutline,
  onSelectHeading,
}: ReviewSummaryProps) {
  const { t } = useTranslation();
  return (
    <div className="review-summary" data-testid="pdf-editor-review-summary">
      <section className="review-summary__section">
        <SectionHeader
          title={t("pdfTextEditor.review.summary.title", "Tagging")}
        />
        <TaggingProgress {...progress} />
        {review && (
          <ToDoRows
            rows={[
              {
                icon: "image",
                label: t(
                  "pdfTextEditor.inspector.accessibility.missingDescriptions",
                  "Missing descriptions",
                ),
                count: review.needsDescription,
              },
              {
                icon: "tag",
                label: t(
                  "pdfTextEditor.inspector.accessibility.untaggedImages",
                  "Untagged images",
                ),
                count: review.untagged,
              },
              {
                icon: "circle-x",
                label: t(
                  "pdfTextEditor.inspector.accessibility.untaggableImages",
                  "Can't be tagged here",
                ),
                count: review.untaggable,
              },
              {
                icon: "file-text",
                label: t(
                  "pdfTextEditor.review.summary.untaggedPages",
                  "Pages with untagged content",
                ),
                count: untaggedPages,
              },
            ]}
          />
        )}
      </section>
      {headingOutline && (
        <section className="review-summary__section">
          <SectionHeader
            title={t(
              "pdfTextEditor.inspector.accessibility.outline.heading",
              "Headings",
            )}
            count={<HeadingProblems count={issueCount(headingOutline)} />}
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

interface ToDoRow {
  icon: IconName;
  label: string;
  count: number;
}

/** What is left, one row per kind with anything in it, laid out like the report's breakdown. */
function ToDoRows({ rows }: { rows: ToDoRow[] }) {
  const left = rows.filter((row) => row.count > 0);
  if (left.length === 0) return null;
  return (
    <ul
      className="review-summary__rows"
      data-testid="pdf-editor-document-accessibility-summary"
    >
      {left.map((row) => (
        <li key={row.icon} className="review-summary__row">
          <Icon name={row.icon} size={16} />
          <span className="review-summary__label">{row.label}</span>
          <Chip accent="warning" size="xs">
            {row.count}
          </Chip>
        </li>
      ))}
    </ul>
  );
}

function HeadingProblems({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <Chip accent="warning" size="xs" data-testid="pdf-editor-heading-problems">
      {t(
        "pdfTextEditor.inspector.accessibility.outline.problemCount",
        "{{count}} to fix",
        { count },
      )}
    </Chip>
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
      <span className="review-summary__headline">
        {t(
          "pdfTextEditor.review.summary.tagged",
          "{{done}} of {{total}} tagged",
          {
            done,
            total,
          },
        )}
      </span>
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
