import { currentEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import type { ReviewItem } from "@editor/tools/pdfTextEditor/util/accessibilityProgress";

/**
 * The review card while it is open, and its top on screen as last drawn, so
 * stepping scrolls the next item level with it instead of moving the card.
 */
export const reviewCard: { open: boolean; top: number | null } = {
  open: false,
  top: null,
};

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
  const el = reviewItemElement(item);
  if (el) {
    scrollElementToCard(el);
    return;
  }
  currentEditorSession()?.revealPage(item.pageIndex);
  let frames = 0;
  const retry = () => {
    const found = reviewItemElement(item);
    if (found) scrollElementToCard(found);
    else if (++frames < MOUNT_WAIT_FRAMES) requestAnimationFrame(retry);
  };
  requestAnimationFrame(retry);
}

function scrollElementToCard(el: Element): void {
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
