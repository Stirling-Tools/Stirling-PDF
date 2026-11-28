import { createContext, useContext, useId } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { Checkbox } from "@editor/ui/Checkbox";
import { Icon } from "@editor/ui/Icon";
import { useReviewMarkedTagged } from "@editor/tools/pdfTextEditor/store/reviewMarkedTagged";
import type { FileId } from "@editor/types/file";

/** Whether a checked file declares itself tagged as its report has it, and a way to ask the review to change it. */
export interface CheckedFileMarkedTagged {
  fileId: FileId;
  marked: boolean;
  editable: boolean;
  /** Opens the file in the review, which applies `marked` as an unsaved edit. */
  request: (marked: boolean) => void;
}

/** The report's file's tagged flag; null where the report cannot change it. */
export const MarkedTaggedContext =
  createContext<CheckedFileMarkedTagged | null>(null);

export interface MarkedTaggedControl {
  /** Unsaved review edits included. */
  marked: boolean;
  editable: boolean;
  set: (marked: boolean) => void;
}

/**
 * The report's file's tagged flag: the review's while the review has the file
 * open, so a change there shows as the unsaved edit it is; the report's
 * otherwise. Subscribes to the review, so call it in the controls that show the flag.
 */
export function useMarkedTagged(): MarkedTaggedControl | null {
  const file = useContext(MarkedTaggedContext);
  const review = useReviewMarkedTagged();
  if (!file) return null;
  if (review?.fileId === file.fileId)
    return {
      marked: review.marked,
      editable: review.editable,
      set: review.set,
    };
  return { marked: file.marked, editable: file.editable, set: file.request };
}

/** Flags the document as tagged when ticked, and withdraws the flag when unticked. */
export function MarkedTaggedField({ untaggedLeft }: { untaggedLeft: boolean }) {
  const { t } = useTranslation();
  const cautionId = useId();
  const control = useMarkedTagged();
  if (!control) return null;
  const hint = t(
    "checkAccessibility.markedTagged.hint",
    "Records in the file that its tags are complete. Screen readers that see it read the tags alone, so tick it once everything is tagged.",
  );
  return (
    <div className="a11y-issue__fix">
      <Checkbox
        checked={control.marked}
        onChange={(event) => control.set(event.currentTarget.checked)}
        disabled={!control.editable}
        label={
          <Tooltip
            content={hint}
            position="top"
            sidebarTooltip={false}
            offset={6}
            arrow
            portalTarget={document.body}
          >
            <span>
              {t(
                "checkAccessibility.markedTagged.label",
                "Mark the document as tagged",
              )}
            </span>
          </Tooltip>
        }
        // The tooltip opens on hover only; the input carries the hint for keyboard and screen readers.
        aria-description={hint}
        aria-describedby={untaggedLeft ? cautionId : undefined}
        data-testid="a11y-marked-tagged"
      />
      {untaggedLeft && (
        <MarkedTaggedCaution
          id={cautionId}
          testId="a11y-marked-tagged-caution"
        />
      )}
    </div>
  );
}

/** Readers that honour the flag read only the tags, so flagging hides what is left untagged. */
export function MarkedTaggedCaution({
  id,
  testId,
}: {
  id: string;
  testId: string;
}) {
  const { t } = useTranslation();
  return (
    <p id={id} className="a11y-issue__caution" data-testid={testId}>
      <Icon name="triangle-alert" size={14} />
      <span>
        {t(
          "checkAccessibility.fix.markedTaggedUntagged",
          "Some content isn't tagged yet. Once the document is marked, screen readers may skip it.",
        )}
      </span>
    </p>
  );
}
