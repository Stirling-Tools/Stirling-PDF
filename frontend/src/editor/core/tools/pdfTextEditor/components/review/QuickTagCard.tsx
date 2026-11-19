import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Switch, Textarea } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { TEXT_BLOCK_TYPES } from "@editor/tools/pdfTextEditor/model/PageStructure";
import { FURNITURE } from "@editor/tools/pdfTextEditor/model/artifactKind";
import type { Controller } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import {
  artifactName,
  typeName,
} from "@editor/tools/pdfTextEditor/components/inspector/TextAccessibilitySection";
import type { ReviewProgress } from "@editor/tools/pdfTextEditor/hooks/useAccessibilityProgress";
import { selectReviewItem } from "@editor/tools/pdfTextEditor/hooks/useAccessibilityProgress";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  reviewMode,
  useReviewMode,
} from "@editor/tools/pdfTextEditor/store/reviewMode";
import {
  canBeArtifact,
  canTypeText,
  type TextTagChoice,
} from "@editor/tools/pdfTextEditor/util/textAccessibility";
import {
  nextTodo,
  reviewItems,
} from "@editor/tools/pdfTextEditor/util/accessibilityProgress";
import { isFocusInContentEditable } from "@editor/tools/pdfTextEditor/util/dom";
import {
  reviewCard,
  subscribeCardHold,
  reviewItemElement,
} from "@editor/tools/pdfTextEditor/util/reviewCardScroll";
import type { ReviewItem } from "@editor/tools/pdfTextEditor/util/accessibilityProgress";
import { ReviewChecklist } from "@editor/tools/pdfTextEditor/components/review/ReviewChecklist";
import "@editor/tools/pdfTextEditor/components/review/review.css";

const CARD_WIDTH = 300;
const GAP_PX = 12;
/** The column the viewer clears beside its pages for the card: its width and a gap either side. */
export const REVIEW_COLUMN_REM = (CARD_WIDTH + GAP_PX * 2) / 16;
/** The types most text is, in key order 1-7; the rest stay in the full picker. */
const QUICK_TYPES = (
  ["P", "H1", "H2", "H3", "Quote", "Note", "Code"] as const
).filter((type) => (TEXT_BLOCK_TYPES as readonly string[]).includes(type));

interface Props {
  store: EditorStore;
  state: EditorViewState;
  controller: Controller;
  review: ReviewProgress;
}

/**
 * The review in one card beside the pages: score and lists, then the selected item's
 * tag choices. It sits level with the item, sticking to the viewer's top or bottom.
 */
export function QuickTagCard({ store, state, controller, review }: Props) {
  const { t } = useTranslation();
  const { autoAdvance, showAllTags } = useReviewMode();
  const item = review.current;
  const frame = useViewerFrame();
  const top = useCardTop(item, frame);
  useCardOpen();
  const [cardHeight, setCardHeight] = useState(0);
  const measureCard = (el: HTMLDivElement | null) => {
    if (!el) return;
    reviewCard.top = el.getBoundingClientRect().top;
    if (el.offsetHeight !== cardHeight) setCardHeight(el.offsetHeight);
  };
  useHiddenPageScrollbar();

  /** Moves on from the last selected item, so tagging several at once continues after them. */
  const advance = () => {
    const doc = store.document;
    if (!doc) return;
    const { runIds, imageIds } = store.selection.value;
    const selected = new Set([...runIds, ...imageIds]);
    const fresh = reviewItems(doc, store.getState().pages);
    const last = [...fresh].reverse().find((i) => selected.has(i.id));
    if (!last) return;
    const next = nextTodo(fresh, last.id);
    if (next) selectReviewItem(store, next);
  };
  const afterTag = () => {
    if (reviewMode.get().autoAdvance) advance();
  };
  const applyText = (choice: TextTagChoice) => {
    controller.onSetTextTag(choice);
    afterTag();
  };

  const tag = controller.textTag;
  // The tag applies to every selected block, as the inspector's picker does.
  const multiText = !item && tag !== null && controller.selectionCount > 1;
  const asksText = (item?.kind === "text" || multiText) && tag !== null;
  const typed = tag ? canTypeText(tag) : false;
  const artifactable = tag ? canBeArtifact(tag) : false;
  const textChoices = QUICK_TYPES;
  useTagKeys(asksText ? { typed, artifactable, textChoices, applyText } : null);

  if (!frame || top === null) return null;
  const { viewer, pagesRight } = frame;
  const minTop = viewer.top + GAP_PX;
  const maxTop = Math.max(minTop, viewer.bottom - cardHeight - GAP_PX);
  const cardTop = Math.min(Math.max(top, minTop), maxTop);

  return createPortal(
    <div
      className="review-card"
      ref={measureCard}
      style={{
        left: Math.min(pagesRight ?? viewer.right, viewer.right) + GAP_PX,
        top: cardTop,
        width: CARD_WIDTH,
        maxHeight: viewer.height - GAP_PX * 2,
      }}
      data-testid="pdf-editor-quick-tag"
      // A press here must not reach the page, which would clear the selection.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ReviewChecklist state={state} review={review} />

      {item ? (
        <header className="review-card__head">
          <span
            className={`review-card__status review-card__status--${item.status}`}
          >
            {item.status === "done"
              ? t("pdfTextEditor.review.card.done", "Tagged")
              : t("pdfTextEditor.review.card.todo", "Needs attention")}
          </span>
        </header>
      ) : multiText ? (
        <header className="review-card__head">
          <span className="review-card__status">
            {t("pdfTextEditor.review.card.selectedCount", {
              count: controller.selectionCount,
              defaultValue_one: "{{count}} block selected",
              defaultValue_other: "{{count}} blocks selected",
            })}
          </span>
        </header>
      ) : (
        <p className="review-card__hint">
          {t(
            "pdfTextEditor.review.card.pickHint",
            "Click a block or an image on the page, or press the arrow to go to the next one still to tag. Shift-click to tag several at once.",
          )}
        </p>
      )}

      {asksText && tag && (
        <>
          <p className="review-card__label">
            {t("pdfTextEditor.review.card.textQuestion", "What is this text?")}
          </p>
          <div
            className="review-card__chips"
            data-fix-target="untagged heading"
          >
            {textChoices.map((type, i) => (
              <button
                key={type}
                type="button"
                className="review-chip"
                data-active={tag.kind === "tagged" && tag.block.type === type}
                disabled={!typed}
                onClick={() => applyText(type)}
              >
                {typeName(t, type)}
                <kbd>{i + 1}</kbd>
              </button>
            ))}
          </div>
          {controller.textUntaggedLinks && (
            <Button
              size="sm"
              variant="secondary"
              accent="neutral"
              leftSection={<Icon name="link" size={16} />}
              onClick={controller.textUntaggedLinks.onTag}
              data-fix-target="link"
              data-testid="pdf-editor-quick-tag-links"
            >
              {t("pdfTextEditor.inspector.accessibility.tagLinks", "Tag link", {
                count: controller.textUntaggedLinks.count,
              })}
            </Button>
          )}
          <p className="review-card__label">
            {t(
              "pdfTextEditor.review.card.skipQuestion",
              "Or skip it for screen readers",
            )}
          </p>
          <div className="review-card__chips">
            {[null, ...FURNITURE].map((furniture) => (
              <button
                key={furniture ?? "decorative"}
                type="button"
                className="review-chip review-chip--quiet"
                data-active={
                  tag.kind === "artifact" && tag.furniture === furniture
                }
                disabled={!artifactable}
                onClick={() => applyText({ artifact: furniture })}
              >
                {artifactName(t, furniture)}
                {furniture === null && <kbd>D</kbd>}
              </button>
            ))}
          </div>
        </>
      )}

      {item?.kind === "image" && controller.imageAccessibility && (
        <ImageQuestion
          key={item.id}
          accessibility={controller.imageAccessibility}
          onDescribe={(text) => {
            controller.onSetImageDescription(text);
            afterTag();
          }}
          onDecorative={() => {
            controller.onSetImageDecorative(true);
            afterTag();
          }}
        />
      )}

      <footer className="review-card__foot">
        <Switch
          size="xs"
          checked={autoAdvance}
          onChange={(e) =>
            reviewMode.set({ autoAdvance: e.currentTarget.checked })
          }
          label={t(
            "pdfTextEditor.review.card.autoAdvance",
            "Go to the next item after tagging",
          )}
        />
        <Switch
          size="xs"
          checked={showAllTags}
          onChange={(e) =>
            reviewMode.set({ showAllTags: e.currentTarget.checked })
          }
          label={t(
            "pdfTextEditor.review.card.showAllTags",
            "Show tags on every block",
          )}
          data-testid="pdf-editor-review-show-all-tags"
        />
      </footer>
    </div>,
    document.body,
  );
}

function ImageQuestion({
  accessibility,
  onDescribe,
  onDecorative,
}: {
  accessibility: NonNullable<Controller["imageAccessibility"]>;
  onDescribe: (text: string) => void;
  onDecorative: () => void;
}) {
  const { t } = useTranslation();
  const existing =
    accessibility.kind === "describable"
      ? (accessibility.description ?? "")
      : "";
  const [text, setText] = useState(existing);
  const describable = accessibility.kind === "describable";
  return (
    <>
      <p className="review-card__label">
        {t(
          "pdfTextEditor.review.card.imageQuestion",
          "What does this image show?",
        )}
      </p>
      <Textarea
        autosize
        minRows={2}
        maxRows={5}
        value={text}
        disabled={!describable}
        placeholder={t(
          "pdfTextEditor.review.card.imagePlaceholder",
          "For example: Bar chart of revenue by region, Europe highest",
        )}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && text.trim()) {
            e.preventDefault();
            onDescribe(text.trim());
          }
        }}
        data-autofocus
        data-testid="pdf-editor-quick-tag-description"
        data-fix-target="untagged image"
      />
      <div className="review-card__row">
        <Button
          size="sm"
          variant="primary"
          disabled={!describable || !text.trim()}
          onClick={() => onDescribe(text.trim())}
        >
          {t("pdfTextEditor.review.card.saveDescription", "Save description")}
        </Button>
        <Button
          size="sm"
          variant="tertiary"
          accent="neutral"
          onClick={onDecorative}
        >
          {t("pdfTextEditor.review.card.decorative", "It's decorative")}
        </Button>
      </div>
    </>
  );
}

/** Number keys pick the matching text tag and D marks it decorative, unless the user is typing. */
function useTagKeys(
  binding: {
    typed: boolean;
    artifactable: boolean;
    textChoices: readonly TextTagChoice[];
    applyText: (choice: TextTagChoice) => void;
  } | null,
): void {
  useEffect(() => {
    if (!binding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (
        isFocusInContentEditable() ||
        target?.closest("input, textarea, select, [role='combobox']")
      )
        return;
      const digit = Number(e.key);
      if (
        binding.typed &&
        Number.isInteger(digit) &&
        digit >= 1 &&
        digit <= binding.textChoices.length
      ) {
        e.preventDefault();
        binding.applyText(binding.textChoices[digit - 1]);
      } else if (binding.artifactable && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        binding.applyText({ artifact: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [binding]);
}

interface ViewerFrame {
  /** The pages' scroller on screen. */
  viewer: DOMRect;
  /** The right edge of the widest mounted page; null before any has laid out. */
  pagesRight: number | null;
}

/**
 * The viewer and its pages on screen, kept current through scrolling, zoom, sidebars
 * and remounts. The viewer alone places the card until new pages lay out.
 */
function useViewerFrame(): ViewerFrame | null {
  const [frame, setFrame] = useState<ViewerFrame | null>(null);
  useLayoutEffect(() => {
    let raf = 0;
    const resizes = new ResizeObserver(() => measure());
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const viewer = document.querySelector("[data-viewer-pages]");
        if (!viewer) {
          setFrame(null);
          return;
        }
        resizes.observe(viewer);
        let pagesRight: number | null = null;
        for (const page of viewer.querySelectorAll("[data-page-index]")) {
          resizes.observe(page);
          const rect = page.getBoundingClientRect();
          if (rect.width > 0)
            pagesRight = Math.max(pagesRight ?? rect.right, rect.right);
        }
        const next = { viewer: viewer.getBoundingClientRect(), pagesRight };
        setFrame((prev) => (sameFrame(prev, next) ? prev : next));
      });
    };
    measure();
    // Catches the viewer being replaced and pages mounting, which no observer
    // on the old elements sees.
    const mutations = new MutationObserver(measure);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      resizes.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, []);
  return frame;
}

function sameFrame(a: ViewerFrame | null, b: ViewerFrame): boolean {
  if (!a) return false;
  return (
    a.pagesRight === b.pagesRight &&
    a.viewer.left === b.viewer.left &&
    a.viewer.top === b.viewer.top &&
    a.viewer.right === b.viewer.right &&
    a.viewer.height === b.viewer.height
  );
}

/**
 * The card's top before clamping: level with the selected item, or where it last
 * was while a step scrolls or the item is not mounted.
 */
function useCardTop(
  item: ReviewItem | null,
  frame: ViewerFrame | null,
): number | null {
  const itemTop = useItemTop(item);
  const held = useSyncExternalStore(subscribeCardHold, () => reviewCard.held);
  const lastRef = useRef<number | null>(null);
  const top =
    (held ? lastRef.current : null) ??
    itemTop ??
    lastRef.current ??
    frame?.viewer.top ??
    null;
  lastRef.current = top;
  return top;
}

/** Tells stepping that the card is open, so items are scrolled to the top beside it. */
function useCardOpen(): void {
  useEffect(() => {
    reviewCard.open = true;
    return () => {
      reviewCard.open = false;
      reviewCard.top = null;
    };
  }, []);
}

/** The selected item's top on screen, kept current as the pages scroll; null while it is not mounted. */
function useItemTop(item: ReviewItem | null): number | null {
  const [top, setTop] = useState<number | null>(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  const itemId = item?.id ?? null;
  useLayoutEffect(() => {
    const item = itemRef.current;
    if (!item) {
      setTop(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = reviewItemElement(item);
        setTop(el ? el.getBoundingClientRect().top : null);
      });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [itemId]);
  return top;
}

/** The pages' scrollbar would run under the card, so it is hidden while the card is open. */
function useHiddenPageScrollbar(): void {
  useEffect(() => {
    document.documentElement.dataset.reviewCard = "";
    return () => {
      delete document.documentElement.dataset.reviewCard;
    };
  }, []);
}
