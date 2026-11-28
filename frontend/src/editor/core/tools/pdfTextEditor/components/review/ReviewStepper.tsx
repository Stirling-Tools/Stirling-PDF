import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { CONTROL_HEIGHT, type ControlSize } from "@editor/ui/controlSizes";
import type { ReviewProgress } from "@editor/tools/pdfTextEditor/hooks/useAccessibilityProgress";
import {
  isFocusInContentEditable,
  isModalOpen,
} from "@editor/tools/pdfTextEditor/util/dom";
import "@editor/tools/pdfTextEditor/components/review/review.css";

/** The label keeps the arrows' height, so the card holds still when they go. */
const ARROW_SIZE: ControlSize = "sm";

/**
 * The top of the review card: the arrows through what is left to tag. Once
 * nothing is, the arrows go (disabled ones would read as a next item they can't
 * reach) and the label says so.
 */
export function ReviewStepper({ review }: { review: ReviewProgress }) {
  const { t } = useTranslation();
  useNextKey(review);
  const done = review.todoCount === 0;
  // The label stays the same element throughout: a live region only announces
  // changes to one already mounted, so tagging the last item is heard.
  return (
    <div
      className="review-stepper"
      data-done={done}
      data-testid="pdf-editor-review-stepper"
    >
      {!done && (
        <Button
          size={ARROW_SIZE}
          variant="secondary"
          disabled={!review.previous}
          onClick={() => review.previous && review.select(review.previous)}
          aria-label={t(
            "pdfTextEditor.review.previous",
            "Previous untagged (Shift+N)",
          )}
          leftSection={<Icon name="arrow-left" size={16} />}
          data-testid="pdf-editor-review-previous"
        />
      )}
      <span
        className="review-stepper__label"
        aria-live="polite"
        style={{ minHeight: CONTROL_HEIGHT[ARROW_SIZE] }}
        data-testid="pdf-editor-review-stepper-label"
      >
        {done ? (
          <>
            <Icon name="circle-check" size={16} />
            {t(
              "pdfTextEditor.review.allDone",
              "All text and images are tagged",
            )}
          </>
        ) : (
          untaggedPosition(t, review)
        )}
      </span>
      {!done && (
        <Button
          size={ARROW_SIZE}
          variant="primary"
          disabled={!review.next}
          onClick={() => review.next && review.select(review.next)}
          aria-label={t("pdfTextEditor.review.next", "Next untagged (N)")}
          leftSection={<Icon name="arrow-right" size={16} />}
          data-testid="pdf-editor-review-next"
        />
      )}
    </div>
  );
}

/** Where the selection sits among the items still to tag, or how many are left. */
function untaggedPosition(t: TFunction, review: ReviewProgress): string {
  if (review.todoPosition === null)
    return t("pdfTextEditor.review.untaggedCount", "{{count}} untagged", {
      count: review.todoCount,
    });
  return t(
    "pdfTextEditor.review.untaggedPosition",
    "{{index}} of {{count}} untagged",
    {
      index: review.todoPosition,
      count: review.todoCount,
    },
  );
}

/** N moves to the next untagged item and Shift+N to the previous one, unless the user is typing. */
function useNextKey(review: ReviewProgress): void {
  const { next, previous, select } = review;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (
        isFocusInContentEditable() ||
        isModalOpen() ||
        target?.closest("input, textarea, select, [role='combobox']")
      )
        return;
      const goTo = e.shiftKey ? previous : next;
      if (!goTo) return;
      e.preventDefault();
      select(goTo);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous, select]);
}
