import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import type { ReviewProgress } from "@editor/tools/pdfTextEditor/hooks/useAccessibilityProgress";
import type { EditorViewState } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { ReviewItem } from "@editor/tools/pdfTextEditor/util/accessibilityProgress";
import { isFocusInContentEditable } from "@editor/tools/pdfTextEditor/util/dom";
import "@editor/tools/pdfTextEditor/components/review/review.css";

/** Items listed before the rest collapse behind a count, so a long document stays scannable. */
const LIST_LIMIT = 40;

interface Props {
  state: EditorViewState;
  review: ReviewProgress;
}

/**
 * The top of the review card: the score, the arrows through what is left, and the
 * to-do and done lists.
 */
export function ReviewChecklist({ state, review }: Props) {
  const { t } = useTranslation();
  const [showTodo, setShowTodo] = useState(false);
  const [showDone, setShowDone] = useState(false);
  useNextKey(review);

  const snippets = useMemo(() => {
    const map = new Map<string, string>();
    for (const page of state.pages)
      for (const run of page.runs) map.set(run.id, run.text);
    return map;
  }, [state.pages]);
  const todo = review.items.filter((i) => i.status === "todo");
  const done = review.items.filter((i) => i.status === "done");
  const finished = review.total > 0 && todo.length === 0;

  return (
    <div className="review-checklist" data-testid="pdf-editor-review-checklist">
      <div className="review-score" data-testid="pdf-editor-review-score">
        <ScoreRing done={review.done} total={review.total} />
        <div className="review-score__text">
          <span className="review-score__value">
            {review.done}
            <span className="review-score__total">/{review.total}</span>
          </span>
          <span className="review-score__caption">
            {finished
              ? t(
                  "pdfTextEditor.review.allDone",
                  "All text and images are tagged",
                )
              : t("pdfTextEditor.review.left", "{{count}} left to tag", {
                  count: todo.length,
                })}
            {!review.complete &&
              ` - ${t("pdfTextEditor.review.counting", "still counting")}`}
          </span>
        </div>
      </div>

      <div className="review-stepper" data-testid="pdf-editor-review-stepper">
        <Button
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
        <span className="review-stepper__label" aria-live="polite">
          {untaggedPosition(t, review)}
        </span>
        <Button
          variant="primary"
          disabled={!review.next}
          onClick={() => review.next && review.select(review.next)}
          aria-label={t("pdfTextEditor.review.next", "Next untagged (N)")}
          leftSection={<Icon name="arrow-right" size={16} />}
          data-testid="pdf-editor-review-next"
        />
      </div>

      {todo.length > 0 && (
        <CollapsibleList
          title={t("pdfTextEditor.review.todoTitle", "To do ({{count}})", {
            count: todo.length,
          })}
          open={showTodo}
          onToggle={() => setShowTodo((open) => !open)}
        >
          <ItemList items={todo} snippets={snippets} review={review} />
        </CollapsibleList>
      )}

      {done.length > 0 && (
        <CollapsibleList
          title={t("pdfTextEditor.review.doneTitle", "Done ({{count}})", {
            count: done.length,
          })}
          open={showDone}
          onToggle={() => setShowDone((open) => !open)}
        >
          <ItemList items={done} snippets={snippets} review={review} />
        </CollapsibleList>
      )}
    </div>
  );
}

function CollapsibleList({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section>
      <button
        type="button"
        className="review-list__item"
        onClick={onToggle}
        aria-expanded={open}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
        <span className="review-section-title" style={{ margin: 0 }}>
          {title}
        </span>
      </button>
      {open && <div className="review-list__scroll">{children}</div>}
    </section>
  );
}

function ItemList({
  items,
  snippets,
  review,
}: {
  items: readonly ReviewItem[];
  snippets: ReadonlyMap<string, string>;
  review: ReviewProgress;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, LIST_LIMIT);
  return (
    <ul className="review-list">
      {shown.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="review-list__item"
            data-current={review.current?.id === item.id}
            data-done={item.status === "done"}
            onClick={() => review.select(item)}
          >
            <Icon
              name={item.kind === "image" ? "image" : "type"}
              size={14}
              style={{
                color:
                  item.status === "done"
                    ? "var(--c-success)"
                    : "var(--c-warning)",
              }}
            />
            <span className="review-list__text">
              {item.kind === "image"
                ? t("pdfTextEditor.review.image", "Image")
                : (snippets.get(item.id) ?? "").trim() ||
                  t("pdfTextEditor.review.text", "Text")}
            </span>
            <span className="review-list__page">
              {t("pdfTextEditor.review.page", "p. {{page}}", {
                page: item.pageIndex + 1,
              })}
            </span>
          </button>
        </li>
      ))}
      {!expanded && items.length > LIST_LIMIT && (
        <li>
          <button
            type="button"
            className="review-list__item"
            onClick={() => setExpanded(true)}
          >
            {t("pdfTextEditor.review.showAll", "Show all {{count}}", {
              count: items.length,
            })}
          </button>
        </li>
      )}
    </ul>
  );
}

const RING_SIZE = 44;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ScoreRing({ done, total }: { done: number; total: number }) {
  const fraction = total === 0 ? 0 : done / total;
  const colour = fraction === 1 ? "var(--c-success)" : "var(--c-warning)";
  return (
    // icon-lint-allow: runtime-generated-svg -- the ring's arc length is the live score
    <svg
      className="review-score__ring"
      width={RING_SIZE}
      height={RING_SIZE}
      aria-hidden="true"
    >
      <circle
        className="review-score__ring-track"
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={RING_STROKE}
      />
      <circle
        className="review-score__ring-fill"
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill="none"
        stroke={colour}
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
      />
    </svg>
  );
}

/** Where the selection sits among the items still to tag, or how many are left. */
export function untaggedPosition(t: TFunction, review: ReviewProgress): string {
  if (review.todoCount === 0)
    return t("pdfTextEditor.review.noneLeft", "No text or images left to tag");
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
