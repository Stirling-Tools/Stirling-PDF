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
import type { TFunction } from "i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import {
  isDescribableType,
  TEXT_BLOCK_TYPES,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import { FURNITURE } from "@editor/tools/pdfTextEditor/model/artifactKind";
import type { Controller } from "@editor/tools/pdfTextEditor/components/toolbar/toolbarShared";
import {
  artifactName,
  typeName,
} from "@editor/tools/pdfTextEditor/components/inspector/TextAccessibilitySection";
import type { ReviewProgress } from "@editor/tools/pdfTextEditor/hooks/useAccessibilityProgress";
import type { TextDescriptionControl } from "@editor/tools/pdfTextEditor/hooks/useTextAccessibility";
import { selectReviewItem } from "@editor/tools/pdfTextEditor/hooks/useAccessibilityProgress";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
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
import {
  isFocusInContentEditable,
  isModalOpen,
} from "@editor/tools/pdfTextEditor/util/dom";
import {
  reviewCard,
  subscribeCardHold,
  reviewItemElement,
} from "@editor/tools/pdfTextEditor/util/reviewCardScroll";
import type { ReviewItem } from "@editor/tools/pdfTextEditor/util/accessibilityProgress";
import { ReviewStepper } from "@editor/tools/pdfTextEditor/components/review/ReviewStepper";
import { PAGES_PAST_INSET_ATTR } from "@editor/components/viewer/usePagesPastInset";
import "@editor/tools/pdfTextEditor/components/review/review.css";

const CARD_WIDTH = 300;
const GAP_PX = 12;
/** The column the viewer clears beside its pages for the card: its width and a gap either side. */
export const REVIEW_COLUMN_REM = (CARD_WIDTH + GAP_PX * 2) / 16;
/** The types most text is, in key order 1-8; the rest stay in the full picker. */
const QUICK_TYPES = (
  ["P", "H1", "H2", "H3", "Quote", "Note", "Code", "Formula"] as const
).filter((type) => (TEXT_BLOCK_TYPES as readonly string[]).includes(type));

interface Props {
  store: EditorStore;
  controller: Controller;
  review: ReviewProgress;
}

/**
 * The review in one card beside the pages: the way through what is left, then the
 * selected item's tag choices. It sits level with the item, sticking to the viewer's top or bottom.
 */
export function QuickTagCard({ store, controller, review }: Props) {
  const { t } = useTranslation();
  const { autoAdvance, showAllTags } = useReviewMode();
  const item = review.current;
  const frame = useViewerFrame();
  const top = useCardTop(item, frame);
  useCardOpen();
  const [cardHeight, setCardHeight] = useState(0);
  const focusOnOpen = useFocusOnOpen();
  const measureCard = (el: HTMLDivElement | null) => {
    if (!el) return;
    focusOnOpen(el);
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
    // A formula is only done once described, which the card asks for next.
    if (typeof choice === "string" && isDescribableType(choice)) return;
    afterTag();
  };
  const description = controller.textDescription;

  const tag = controller.textTag;
  // The tag applies to every selected block, as the inspector's picker does.
  const multiText = !item && tag !== null && controller.selectionCount > 1;
  const asksText = (item?.kind === "text" || multiText) && tag !== null;
  const typed = tag ? canTypeText(tag) : false;
  const artifactable = tag ? canBeArtifact(tag) : false;
  const imageA11y =
    item?.kind === "image" ? controller.imageAccessibility : null;
  const toggleImageDecorative = () => {
    if (!imageA11y) return;
    const decorative = imageA11y.kind === "decorative";
    controller.onSetImageDecorative(!decorative);
    if (!decorative) afterTag();
  };
  useTagKeys(
    asksText
      ? {
          choices: QUICK_TYPES,
          pick: typed ? applyText : null,
          decorative: artifactable ? () => applyText({ artifact: null }) : null,
        }
      : imageA11y
        ? {
            choices: [],
            pick: null,
            decorative: canToggleDecorative(imageA11y)
              ? toggleImageDecorative
              : null,
          }
        : null,
  );

  if (!frame || top === null) return null;
  const { viewer, columnLeft } = frame;
  const minTop = viewer.top + GAP_PX;
  const maxTop = Math.max(minTop, viewer.bottom - cardHeight - GAP_PX);
  const cardTop = Math.min(Math.max(top, minTop), maxTop);

  return createPortal(
    <div
      className="review-card"
      ref={measureCard}
      style={{
        left: columnLeft + GAP_PX,
        top: cardTop,
        width: CARD_WIDTH,
        maxHeight: viewer.height - GAP_PX * 2,
      }}
      role="region"
      aria-label={t("pdfTextEditor.review.card.label", "Accessibility review")}
      tabIndex={-1}
      data-testid="pdf-editor-quick-tag"
      // A press here must not reach the page, which would clear the selection.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ReviewStepper review={review} />

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
            {QUICK_TYPES.map((type, i) => (
              <button
                key={type}
                type="button"
                className="review-chip"
                data-active={tag.kind === "tagged" && tag.block.type === type}
                aria-pressed={tag.kind === "tagged" && tag.block.type === type}
                disabled={!typed}
                onClick={() => applyText(type)}
              >
                {typeName(t, type)}
                <kbd>{i + 1}</kbd>
              </button>
            ))}
          </div>
          {description && (
            <TextDescriptionQuestion
              // A changed description (Undo) restarts the draft from it.
              key={`${item?.id}:${description.type}:${description.description ?? ""}`}
              control={description}
              onDescribe={(text) => {
                description.onSet(text);
                afterTag();
              }}
            />
          )}
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
          {controller.textUndescribedLinks && (
            <Button
              size="sm"
              variant="secondary"
              accent="neutral"
              leftSection={<Icon name="link" size={16} />}
              onClick={controller.textUndescribedLinks.onDescribe}
              data-fix-target="link"
              data-testid="pdf-editor-quick-tag-describe-links"
            >
              {t(
                "pdfTextEditor.inspector.accessibility.describeLinks",
                "Describe link",
                {
                  count: controller.textUndescribedLinks.count,
                },
              )}
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
                aria-pressed={
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

      {imageA11y && (
        <ImageQuestion
          key={item?.id}
          accessibility={imageA11y}
          onSave={controller.onSetImageDescription}
          onDone={afterTag}
          onDecorative={toggleImageDecorative}
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

/** What screen readers read out in place of the formula or figure the selected text makes up. */
function TextDescriptionQuestion({
  control,
  onDescribe,
}: {
  control: TextDescriptionControl;
  onDescribe: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(control.description ?? "");
  const formula = control.type === "Formula";
  const question = formula
    ? t(
        "pdfTextEditor.review.card.formulaQuestion",
        "How is this formula read aloud?",
      )
    : t(
        "pdfTextEditor.review.card.figureQuestion",
        "What does this figure show?",
      );
  return (
    <>
      <p className="review-card__label">{question}</p>
      <Textarea
        aria-label={question}
        autosize
        minRows={2}
        maxRows={5}
        value={text}
        placeholder={
          formula
            ? t(
                "pdfTextEditor.review.card.formulaPlaceholder",
                "For example: x squared plus one",
              )
            : undefined
        }
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && text.trim()) {
            e.preventDefault();
            onDescribe(text.trim());
          }
        }}
        data-testid="pdf-editor-quick-tag-text-description"
      />
      <div className="review-card__row">
        <Button
          size="sm"
          variant="primary"
          disabled={!text.trim()}
          onClick={() => onDescribe(text.trim())}
        >
          {t("pdfTextEditor.review.card.saveDescription", "Save description")}
        </Button>
      </div>
    </>
  );
}

function imageDescription(
  accessibility: NonNullable<Controller["imageAccessibility"]>,
): string {
  return accessibility.kind === "describable"
    ? (accessibility.description ?? "")
    : "";
}

/** Waits this long after the last keystroke before saving a description. */
const DESCRIPTION_SAVE_MS = 500;

/**
 * Describes the image, saving as the user types; Enter saves and moves on. Keyed by
 * the image, so a pending save is flushed to the image it was typed for.
 */
function ImageQuestion({
  accessibility,
  onSave,
  onDone,
  onDecorative,
}: {
  accessibility: NonNullable<Controller["imageAccessibility"]>;
  onSave: (text: string) => void;
  onDone: () => void;
  onDecorative: () => void;
}) {
  const { t } = useTranslation();
  const stored = imageDescription(accessibility);
  const [text, setText] = useState(stored);
  const draft = useDebouncedSave(stored, onSave);
  // A description changed elsewhere (Undo) replaces the draft, unless it is the one just saved.
  useEffect(() => {
    if (draft.adopt(stored)) setText(stored);
  }, [stored, draft]);
  const describable = accessibility.kind === "describable";
  const decorative = accessibility.kind === "decorative";
  const question = t(
    "pdfTextEditor.review.card.imageQuestion",
    "What does this image show?",
  );
  return (
    <>
      <p className="review-card__label">{question}</p>
      {accessibility.kind === "blocked" && (
        <p
          className="review-card__hint"
          data-testid="pdf-editor-quick-tag-blocked"
        >
          {blockedMessage(t, accessibility)}
        </p>
      )}
      <Textarea
        aria-label={question}
        autosize
        minRows={2}
        maxRows={5}
        value={text}
        disabled={!describable}
        placeholder={t(
          "pdfTextEditor.review.card.imagePlaceholder",
          "Describe the image",
        )}
        onChange={(e) => {
          setText(e.currentTarget.value);
          draft.schedule(e.currentTarget.value.trim());
        }}
        onBlur={draft.flush}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && text.trim()) {
            e.preventDefault();
            draft.flush();
            onDone();
          }
        }}
        data-autofocus
        data-testid="pdf-editor-quick-tag-description"
        data-fix-target="untagged image"
      />
      <p className="review-card__label">
        {t(
          "pdfTextEditor.review.card.skipQuestion",
          "Or skip it for screen readers",
        )}
      </p>
      <div className="review-card__chips">
        <button
          type="button"
          className="review-chip review-chip--quiet"
          data-active={decorative}
          aria-pressed={decorative}
          disabled={!canToggleDecorative(accessibility)}
          onClick={() => {
            draft.cancel();
            onDecorative();
          }}
          data-testid="pdf-editor-quick-tag-decorative"
        >
          {artifactName(t, null)}
          <kbd>D</kbd>
        </button>
      </div>
    </>
  );
}

/** Whether the image's Decorative chip can be pressed: to mark it, or to unmark it. */
function canToggleDecorative(
  accessibility: NonNullable<Controller["imageAccessibility"]>,
): boolean {
  switch (accessibility.kind) {
    case "describable":
      return accessibility.canBeDecorative;
    case "decorative":
      return accessibility.canUndecorate;
    case "blocked":
      return false;
  }
}

/**
 * Saves the latest text a moment after the last change, and at once on flush or
 * unmount. Each schedule holds the `save` of the render that made it, so a flush
 * after the selection moves still writes to the item the text was typed for.
 */
function useDebouncedSave(stored: string, save: (text: string) => void) {
  const currentSave = useRef(save);
  currentSave.current = save;
  const [draft] = useState(() => {
    let saved = stored;
    let pending: { text: string; save: (text: string) => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
    };
    const flush = () => {
      const next = pending;
      cancel();
      if (!next || next.text === saved) return;
      saved = next.text;
      next.save(next.text);
    };
    return {
      flush,
      cancel,
      /** True when `text` is not what this draft last saved, and takes it as saved. */
      adopt(text: string): boolean {
        if (text === saved) return false;
        saved = text;
        cancel();
        return true;
      },
      schedule(text: string) {
        if (timer !== null) clearTimeout(timer);
        pending = { text, save: currentSave.current };
        timer = setTimeout(flush, DESCRIPTION_SAVE_MS);
      },
    };
  });
  useEffect(() => draft.flush, [draft]);
  return draft;
}

/** Why an image's description can't be changed here. */
function blockedMessage(
  t: TFunction,
  accessibility: Extract<
    NonNullable<Controller["imageAccessibility"]>,
    { kind: "blocked" }
  >,
): string {
  switch (accessibility.blocker) {
    case "untagged":
      return accessibility.documentTagged
        ? t(
            "pdfTextEditor.inspector.accessibility.untaggedImage",
            "Can't be tagged here",
          )
        : t(
            "pdfTextEditor.inspector.accessibility.untaggedDocument",
            "Document has no tags",
          );
    case "not-figure":
      return t(
        "pdfTextEditor.inspector.accessibility.notFigure",
        "Tagged as part of the text",
      );
    case "encrypted":
      return t(
        "pdfTextEditor.inspector.accessibility.encrypted",
        "Tags can't be edited in an encrypted file",
      );
    case "unreadable":
      return t(
        "pdfTextEditor.inspector.accessibility.unreadable",
        "This file's tags can't be edited",
      );
  }
}

/** Moves focus into the card the first time it shows, unless the user is typing somewhere. */
function useFocusOnOpen(): (card: HTMLElement) => void {
  const focused = useRef(false);
  return (card) => {
    if (focused.current) return;
    focused.current = true;
    const active = document.activeElement;
    if (
      isFocusInContentEditable() ||
      active?.closest("input, textarea, select, [role='combobox']")
    )
      return;
    card.focus({ preventScroll: true });
  };
}

/** Number keys pick the matching text tag and D toggles decorative, unless the user is typing. */
function useTagKeys(
  binding: {
    choices: readonly TextTagChoice[];
    /** Null while the item's tag can't be chosen. */
    pick: ((choice: TextTagChoice) => void) | null;
    /** Null while the item can't be made decorative. */
    decorative: (() => void) | null;
  } | null,
): void {
  useEffect(() => {
    if (!binding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (
        isFocusInContentEditable() ||
        isModalOpen() ||
        target?.closest("input, textarea, select, [role='combobox']")
      )
        return;
      const digit = Number(e.key);
      if (
        binding.pick &&
        Number.isInteger(digit) &&
        digit >= 1 &&
        digit <= binding.choices.length
      ) {
        e.preventDefault();
        binding.pick(binding.choices[digit - 1]);
      } else if (binding.decorative && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        binding.decorative();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [binding]);
}

interface ViewerFrame {
  /** The pages' scroller on screen. */
  viewer: DOMRect;
  /** Where the card's column starts: beside the pages, or inside the viewer while they run under it. */
  columnLeft: number;
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
        const rect = viewer.getBoundingClientRect();
        const columnLeft = viewer.hasAttribute(PAGES_PAST_INSET_ATTR)
          ? rect.right -
            REVIEW_COLUMN_REM *
              parseFloat(getComputedStyle(document.documentElement).fontSize)
          : Math.min(pagesRight ?? rect.right, rect.right);
        const next = { viewer: rect, columnLeft };
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
    a.columnLeft === b.columnLeft &&
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
