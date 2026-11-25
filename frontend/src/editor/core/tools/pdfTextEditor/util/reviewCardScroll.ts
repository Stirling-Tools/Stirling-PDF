import { currentEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import type { ReviewItem } from "@editor/tools/pdfTextEditor/util/accessibilityProgress";

/**
 * The review card while open: its top as last drawn, which stepping scrolls items
 * level with, and whether it is held still while that scroll runs.
 */
export const reviewCard: { open: boolean; top: number | null; held: boolean } =
  { open: false, top: null, held: false };

const holdListeners = new Set<() => void>();

export function subscribeCardHold(listener: () => void): () => void {
  holdListeners.add(listener);
  return () => holdListeners.delete(listener);
}

function setHeld(held: boolean): void {
  if (reviewCard.held === held) return;
  reviewCard.held = held;
  holdListeners.forEach((listener) => listener());
}

/** Frames the pages must stay still after a step before the card follows its item again. */
const SETTLE_FRAMES = 4;
/** Releases a hold whose scroll never settles, so the card cannot stay frozen. */
const MAX_HOLD_FRAMES = 150;
let holdRun = 0;
let stepRun = 0;
let stepScrollPending = false;

/**
 * Holds the card where it is until the step's scroll settles, so selecting the
 * next item does not first pull the card to wherever that item sits.
 */
export function holdCardWhileStepping(): void {
  const run = ++holdRun;
  stepScrollPending = true;
  setHeld(true);
  let lastTop: number | null = null;
  let still = 0;
  let frames = 0;
  const watch = () => {
    if (run !== holdRun) return;
    const top = viewerScroller()?.scrollTop ?? null;
    still = !stepScrollPending && top === lastTop ? still + 1 : 0;
    lastTop = top;
    if (still >= SETTLE_FRAMES || ++frames >= MAX_HOLD_FRAMES) setHeld(false);
    else requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
}

function viewerScroller(): Element | null {
  const page = document.querySelector("[data-viewer-pages] [data-page-index]");
  return page ? scrollParent(page) : null;
}

/** Room left above an item scrolled to the top of the pages when the card's top is unknown. */
const ITEM_TOP_GAP_PX = 12;

export function reviewItemElement(item: ReviewItem): Element | null {
  const testId = `pdf-editor-${item.kind === "text" ? "run" : "image"}-${item.id}`;
  return document.querySelector(`[data-testid="${CSS.escape(testId)}"]`);
}

/** How many frames to wait for an unmounted page to mount after it is revealed. */
const MOUNT_WAIT_FRAMES = 90;

/**
 * Scrolls `item` level with the card as far as the pages allow; past that the card
 * moves. An item on an unmounted page is brought near first.
 */
export function scrollItemToCard(item: ReviewItem): void {
  // A newer step abandons this one's wait for an unmounted page.
  const step = ++stepRun;
  const el = reviewItemElement(item);
  if (el) {
    scrollElementToCard(el);
    return;
  }
  currentEditorSession()?.revealPage(item.pageIndex);
  let frames = 0;
  const retry = () => {
    if (step !== stepRun) return;
    const found = reviewItemElement(item);
    if (found) scrollElementToCard(found);
    else if (++frames < MOUNT_WAIT_FRAMES) requestAnimationFrame(retry);
    else stepScrollPending = false;
  };
  requestAnimationFrame(retry);
}

function scrollElementToCard(el: Element): void {
  stepScrollPending = false;
  const scroller = scrollParent(el);
  if (!scroller) return;
  const target =
    reviewCard.top ?? scroller.getBoundingClientRect().top + ITEM_TOP_GAP_PX;
  const offset = el.getBoundingClientRect().top - target;
  scroller.scrollBy({ top: offset, behavior: "smooth" });
}

function scrollParent(el: Element): Element | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    )
      return node;
  }
  return null;
}
