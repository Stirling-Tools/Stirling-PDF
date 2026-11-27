import { currentEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import {
  plainDomRange,
  readOverlayText,
  plainCaretOffset,
  restoreCaretOffset,
} from "@editor/tools/pdfTextEditor/util/overlayPainter";
import type { ListEdit } from "@editor/tools/pdfTextEditor/util/listText";
import { clamp } from "@editor/utils/genericUtils";

/** True when focus is in a typing surface (contenteditable, input, etc). */
export function isFocusInContentEditable(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

// True when focus is in a FORM field (Find/Replace/password inputs) as opposed
// to a run's contenteditable.
export function isFocusInFormField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function isModalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

// The page index of the page nearest the viewport centre.
export function visiblePageIndex(): number {
  const pages = pageElements();
  if (pages.length === 0) return 0;
  const midY = window.innerHeight / 2;
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const el of pages) {
    const n = Number((el.dataset.testid ?? "").replace("pdf-editor-page-", ""));
    if (!Number.isFinite(n)) continue;
    const rect = el.getBoundingClientRect();
    const dist = Math.abs(rect.top + rect.height / 2 - midY);
    if (dist < bestDist) {
      bestDist = dist;
      best = n;
    }
  }
  return best;
}

/** All real page surfaces in DOM order, skipping placeholders/error tiles. */
function pageElements(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-testid^="pdf-editor-page-"]'),
  ).filter((el) => /^pdf-editor-page-\d+$/.test(el.dataset.testid ?? ""));
}

/**
 * Scrolls `el` into view, or, when its page is not mounted, asks the host to
 * bring that page on screen.
 */
export function revealOnPage(el: Element | null, pageIndex: number): void {
  if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  else currentEditorSession()?.revealPage(pageIndex);
}

const FOCUS_WAIT_FRAMES = 30;
const REVEAL_WAIT_FRAMES = 120;
const REVEAL_EVERY_FRAMES = 6;

function runBox(runId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-run-id="${CSS.escape(runId)}"]`,
  );
}

export function focusRunWhenPainted(
  runId: string,
  caretAtEnd = false,
  heldKeys?: () => string,
  caretOffset?: number,
  revealOnPage?: number,
): void {
  releasePendingKeys?.();
  let frames = 0;
  let released = false;
  const takeHeldKeys = () => {
    if (released) return "";
    released = true;
    if (releasePendingKeys === giveBackKeys) releasePendingKeys = null;
    return heldKeys?.() ?? "";
  };
  const giveBackKeys = () => typeIntoFocusedRun(takeHeldKeys());
  releasePendingKeys = giveBackKeys;
  const request = ++latestFocusRequest;
  const origin = document.activeElement;
  const attempt = () => {
    if (request !== latestFocusRequest) return;
    const el = runBox(runId);
    if (!stillFocused(origin, el)) {
      giveBackKeys();
      return;
    }
    if (!el) {
      if (revealOnPage !== undefined && frames % REVEAL_EVERY_FRAMES === 0)
        currentEditorSession()?.revealPage(revealOnPage);
      const limit =
        revealOnPage === undefined ? FOCUS_WAIT_FRAMES : REVEAL_WAIT_FRAMES;
      if (++frames < limit) requestAnimationFrame(attempt);
      else giveBackKeys();
      return;
    }
    el.focus({ preventScroll: true });
    selectAllText(el);
    if (caretAtEnd) window.getSelection()?.collapseToEnd();
    if (caretOffset !== undefined) restoreCaretOffset(el, caretOffset);
    typeKeys(takeHeldKeys());
    if (revealOnPage !== undefined) keepCaretInView(el, REVEAL_MARGIN_PX);
  };
  requestAnimationFrame(attempt);
}

export function selectAllText(el: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

let latestFocusRequest = 0;
let releasePendingKeys: (() => void) | null = null;

function stillFocused(
  origin: Element | null,
  target: HTMLElement | null,
): boolean {
  const active = document.activeElement;
  return (
    !active ||
    active === document.body ||
    active === origin ||
    active === target
  );
}

function typeIntoFocusedRun(text: string): void {
  const active = document.activeElement;
  if (
    text &&
    active instanceof HTMLElement &&
    active.isConnected &&
    active.hasAttribute("data-run-id")
  )
    typeKeys(text);
}

const CARET_MARGIN_PX = 16;
const REVEAL_MARGIN_PX = 120;

export function keepCaretInView(
  box: HTMLElement,
  margin = CARET_MARGIN_PX,
): void {
  const scroller = scrollParent(box);
  if (!scroller) return;
  const caret = caretRect(box);
  const view = scroller.getBoundingClientRect();
  const bottom = Math.min(view.bottom, coveredFrom(scroller, caret, view));
  const room = Math.max(margin, caret.height * 1.5);
  if (caret.bottom > bottom - room)
    scroller.scrollTop += caret.bottom - (bottom - room);
  else if (caret.top < view.top + margin)
    scroller.scrollTop -= view.top + margin - caret.top;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && !/(auto|scroll)/.test(getComputedStyle(node).overflowY))
    node = node.parentElement;
  return node;
}

function caretRect(box: HTMLElement): DOMRect {
  const sel = window.getSelection();
  if (sel?.rangeCount && box.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    if (rect.height) return rect;
  }
  return box.getBoundingClientRect();
}

function coveredFrom(
  scroller: HTMLElement,
  caret: DOMRect,
  view: DOMRect,
): number {
  const x = clamp(caret.left + 1, view.left + 1, view.right - 1);
  const y = Math.min(caret.top + caret.height / 2, view.bottom - 1);
  const hit = document.elementFromPoint(x, y);
  return hit && !scroller.contains(hit)
    ? hit.getBoundingClientRect().top
    : view.bottom;
}

function typeKeys(text: string): void {
  text.split("\n").forEach((line, i) => {
    if (i > 0) document.execCommand("insertParagraph");
    if (line) document.execCommand("insertText", false, line);
  });
}

export function holdKeystrokes(): () => string {
  let typed = "";
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target && target !== document.body && !target.closest("[data-run-id]"))
      return;
    if (e.key.length === 1) typed += e.key;
    else if (e.key === "Enter") typed += "\n";
    else if (e.key === "Backspace") typed = typed.slice(0, -1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("keydown", onKey, true);
  return () => {
    window.removeEventListener("keydown", onKey, true);
    return typed;
  };
}

export function focusedRunCaret(runId: string): number | null {
  const el = runBox(runId);
  return el && document.activeElement === el ? plainCaretOffset(el) : null;
}

export function editFocusedRun(
  runId: string,
  edit: ListEdit,
  typed: string,
): void {
  requestAnimationFrame(() => {
    const el = runBox(runId);
    if (!el || document.activeElement !== el) return;
    if (readOverlayText(el).replace(/\u00A0/g, " ") !== typed) return;
    const selection = window.getSelection();
    if (!selection) return;
    for (const splice of [...edit.splices].reverse()) {
      const range = plainDomRange(el, splice);
      if (!range) return;
      selection.removeAllRanges();
      selection.addRange(range);
      if (splice.insert)
        document.execCommand("insertText", false, splice.insert);
      else document.execCommand("delete");
    }
    restoreCaretOffset(el, edit.caret);
  });
}

export function moveToLineEdge(e: {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  preventDefault(): void;
}): boolean {
  if (e.key !== "Home" && e.key !== "End") return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  e.preventDefault();
  sel.modify(
    e.shiftKey ? "extend" : "move",
    e.key === "Home" ? "backward" : "forward",
    "lineboundary",
  );
  return true;
}
