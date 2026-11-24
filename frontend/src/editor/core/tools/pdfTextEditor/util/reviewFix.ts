import type { AccessibilityFixTarget } from "@editor/utils/accessibilityFixes";
import { linkTexts } from "@editor/tools/pdfTextEditor/commands/linkText";
import {
  taggableLinks,
  undescribedLinks,
} from "@editor/tools/pdfTextEditor/commands/TagLinkCommand";
import { ensurePageRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { selectHeadingAt } from "@editor/tools/pdfTextEditor/hooks/useHeadingOutline";
import { selectReviewItem } from "@editor/tools/pdfTextEditor/hooks/useAccessibilityProgress";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { currentEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import {
  reviewItems,
  type ReviewItem,
} from "@editor/tools/pdfTextEditor/util/accessibilityProgress";
import { headingOutline } from "@editor/tools/pdfTextEditor/util/headingOutline";

/** How many frames to wait for a fix's control to appear: a popover opening, a page mounting. */
const SHOW_WAIT_FRAMES = 90;
/** Tried in order, so a field's input wins over the help icon in its label, and a chosen tag over the others. */
const FOCUSABLE = [
  "input, textarea, select",
  'button[data-active="true"]',
  "button",
  "[tabindex]",
];
const FLASH_CLASS = "review-fix-flash";
/** Read pages this long before letting the browser paint and take input. */
const SCAN_SLICE_MS = 50;

/**
 * Selects what `target` fixes from `pageIndex` on, then focuses the control
 * marked `data-fix-target`. With nothing left, shows the page.
 */
export async function goToFix(
  store: EditorStore,
  pageIndex: number,
  target: AccessibilityFixTarget,
): Promise<void> {
  const control = await select(store, pageIndex, target);
  if (control) focusFixControl(control);
  else currentEditorSession()?.revealPage(pageIndex);
}

/** Selects what `target` fixes, returning the control to focus; null when nothing from `pageIndex` on needs it. */
async function select(
  store: EditorStore,
  pageIndex: number,
  target: AccessibilityFixTarget,
): Promise<AccessibilityFixTarget | null> {
  switch (target) {
    case "untagged":
    case "image": {
      const matches =
        target === "image"
          ? (item: ReviewItem) =>
              item.kind === "image" && item.status === "todo"
          : (item: ReviewItem) => item.status === "todo";
      return (await selectFirst(store, pageIndex, matches)) ? target : null;
    }
    case "heading":
      return selectFlaggedHeading(store, pageIndex) ? target : null;
    case "link":
      return selectLinkToFix(store, pageIndex);
    case "markedTagged":
      return target;
  }
}

/**
 * Reads pages one at a time from `pageIndex`, selecting the first item `matches`.
 * Yields to the browser between slices: on a long file with nothing to match it
 * reads every page. False when nothing matches or another document opens.
 */
async function selectFirst(
  store: EditorStore,
  pageIndex: number,
  matches: (item: ReviewItem) => boolean,
): Promise<boolean> {
  const doc = store.document;
  if (!doc) return false;
  const pageCount = store.getState().pages.length;
  let sliceStart = performance.now();
  for (let index = pageIndex; index < pageCount; index++) {
    if (performance.now() - sliceStart > SCAN_SLICE_MS) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (store.document !== doc) return false;
      sliceStart = performance.now();
    }
    ensurePageRead(store, index);
    const page = store.getState().pages[index];
    const item = page && reviewItems(doc, [page]).find(matches);
    if (item) {
      selectReviewItem(store, item);
      return true;
    }
  }
  return false;
}

/** The outline flags a heading from its level alone, so no page needs reading to find it. */
function selectFlaggedHeading(store: EditorStore, pageIndex: number): boolean {
  const headings = store.document?.headings();
  if (!headings) return false;
  const index = headingOutline(headings, []).entries.findIndex(
    (entry) =>
      entry.issue !== null &&
      entry.pageIndex !== null &&
      entry.pageIndex >= pageIndex,
  );
  return index >= 0 && selectHeadingAt(store, index);
}

/**
 * The run a link fix selects on a page, which must already be read, and the control
 * it focuses: an untagged link's text first, or, on a page with none, a tagged link
 * without a description. Untagged text is tagged first, as Tag link cuts from an
 * element, so its tag choice is focused. Null when the page has no link to fix.
 */
export function linkFixOnPage(
  doc: EditorDocument,
  pageIndex: number,
): { runId: string; target: AccessibilityFixTarget } | null {
  const taggable = taggableLinks(doc, pageIndex)[0]?.text.runId;
  if (taggable) return { runId: taggable, target: "link" };
  const structure = doc.structure(pageIndex);
  const untagged = structure
    .links()
    .filter(({ annotation }) => !structure.linkHeld(annotation));
  const untaggedText = linkTexts(doc, pageIndex, untagged).values().next()
    .value?.runId;
  if (untaggedText) return { runId: untaggedText, target: "untagged" };
  const undescribed = undescribedLinks(doc, pageIndex)[0]?.text.runId;
  return undescribed ? { runId: undescribed, target: "link" } : null;
}

function selectLinkToFix(
  store: EditorStore,
  pageIndex: number,
): AccessibilityFixTarget | null {
  const doc = store.document;
  if (!doc) return null;
  const pageCount = store.getState().pages.length;
  for (let index = pageIndex; index < pageCount; index++) {
    ensurePageRead(store, index);
    const fix = linkFixOnPage(doc, index);
    if (!fix) continue;
    const page = store.getState().pages[index];
    const item =
      page && reviewItems(doc, [page]).find((i) => i.id === fix.runId);
    if (item) selectReviewItem(store, item);
    else store.selection.selectOne(fix.runId);
    return fix.target;
  }
  return null;
}

/**
 * Focuses and flashes the shown control whose `data-fix-target` lists `target` once
 * it appears; gives up quietly if it never does.
 */
function focusFixControl(target: AccessibilityFixTarget): void {
  let frames = 0;
  const attempt = () => {
    const el = document.querySelector<HTMLElement>(
      `[data-fix-target~="${target}"]`,
    );
    if (!el) {
      if (++frames < SHOW_WAIT_FRAMES) window.requestAnimationFrame(attempt);
      return;
    }
    const focusable = FOCUSABLE.map((selector) =>
      el.matches(selector) ? el : el.querySelector<HTMLElement>(selector),
    ).find((candidate) => candidate !== null);
    focusable?.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
    el.classList.remove(FLASH_CLASS);
    // Reading layout restarts the animation when the same control flashes twice in a row.
    void el.offsetWidth;
    el.classList.add(FLASH_CLASS);
    el.addEventListener(
      "animationend",
      () => el.classList.remove(FLASH_CLASS),
      {
        once: true,
      },
    );
  };
  window.requestAnimationFrame(attempt);
}
