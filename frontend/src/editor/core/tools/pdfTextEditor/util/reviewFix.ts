import type { AccessibilityFixTarget } from "@editor/utils/accessibilityFixes";
import { linkTexts } from "@editor/tools/pdfTextEditor/commands/linkText";
import { taggableLinks } from "@editor/tools/pdfTextEditor/commands/TagLinkCommand";
import { ensurePageRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { selectHeadingAt } from "@editor/tools/pdfTextEditor/hooks/useHeadingOutline";
import { selectReviewItem } from "@editor/tools/pdfTextEditor/hooks/useAccessibilityProgress";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { currentEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import { reviewMode } from "@editor/tools/pdfTextEditor/store/reviewMode";
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

/**
 * Selects what `target` fixes from `pageIndex` on, or opens its inspector tab, then
 * focuses the control marked `data-fix-target`. With nothing left, shows the page.
 */
export function goToFix(
  store: EditorStore,
  pageIndex: number,
  target: AccessibilityFixTarget,
): void {
  const control = select(store, pageIndex, target);
  if (control) focusFixControl(control);
  else currentEditorSession()?.revealPage(pageIndex);
}

/** Selects what `target` fixes, returning the control to focus; null when nothing from `pageIndex` on needs it. */
function select(
  store: EditorStore,
  pageIndex: number,
  target: AccessibilityFixTarget,
): AccessibilityFixTarget | null {
  switch (target) {
    case "untagged":
    case "image": {
      const matches =
        target === "image"
          ? (item: ReviewItem) =>
              item.kind === "image" && item.status === "todo"
          : (item: ReviewItem) => item.status === "todo";
      return selectFirst(store, pageIndex, matches) ? target : null;
    }
    case "heading":
      return selectFlaggedHeading(store, pageIndex) ? target : null;
    case "link":
      return selectUntaggedLink(store, pageIndex);
    case "documentLanguage":
    case "markedTagged":
      reviewMode.set({ inspectorTab: "document" });
      return target;
  }
}

/** Reads pages one at a time from `pageIndex`, selecting the first item `matches`. */
function selectFirst(
  store: EditorStore,
  pageIndex: number,
  matches: (item: ReviewItem) => boolean,
): boolean {
  const doc = store.document;
  if (!doc) return false;
  const pageCount = store.getState().pages.length;
  for (let index = pageIndex; index < pageCount; index++) {
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
 * Selects the run under the first untagged link from `pageIndex`. Untagged text is
 * tagged first, as Tag link cuts from an element, so its tag choice is focused.
 */
function selectUntaggedLink(
  store: EditorStore,
  pageIndex: number,
): AccessibilityFixTarget | null {
  const doc = store.document;
  if (!doc) return null;
  const pageCount = store.getState().pages.length;
  for (let index = pageIndex; index < pageCount; index++) {
    ensurePageRead(store, index);
    const taggable = taggableLinks(doc, index)[0]?.text.runId;
    const structure = doc.structure(index);
    const untagged = structure
      .links()
      .filter(({ annotation }) => !structure.linkHeld(annotation));
    const runId =
      taggable ?? linkTexts(doc, index, untagged).values().next().value?.runId;
    if (!runId) continue;
    const page = store.getState().pages[index];
    const item = page && reviewItems(doc, [page]).find((i) => i.id === runId);
    if (item) selectReviewItem(store, item);
    else store.selection.selectOne(runId);
    if (!taggable) return "untagged";
    return "link";
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
