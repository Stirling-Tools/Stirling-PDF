import {
  fitTokenAdvance,
  type TokenFit,
} from "@editor/tools/pdfTextEditor/util/lineLayout";
import { measureAdvancePx } from "@editor/tools/pdfTextEditor/util/textMetrics";
import type { TextRange } from "@editor/tools/pdfTextEditor/types";

export interface PaintToken {
  text: string;
  advancePx: number;
}

export interface PaintLine {
  tokens: PaintToken[];
  heightPx: number;
  marginTopPx: number;
  marginLeftPx: number;
}

export interface PaintOptions {
  font: string;
  fontSizePx: number;
  /**
   * PDF advance per em for characters the run already contains, keyed by
   * character. The only measurement of the document's own face available while
   * the user is typing, so it is what newly typed glyphs are sized against.
   */
  advanceEm?: Map<string, number> | null;
}

const LINE_ATTR = "data-pdf-editor-line";
const TOKEN_ATTR = "data-pdf-editor-token";

export function paintLines(
  el: HTMLElement,
  lines: PaintLine[],
  opts: PaintOptions,
): void {
  const fragment = document.createDocumentFragment();
  lines.forEach((line, index) => {
    const block = document.createElement("div");
    block.setAttribute(LINE_ATTR, String(index));
    // A painted block IS a line of the PDF: one text object, one pen origin,
    // and the page cannot wrap it. So the block must not wrap or grow either.
    // Letting it inherit `pre-wrap` from the container put a long line on two
    // rows here and one row on the page, pushing every block below it a full
    // line-height down - the box then overhung its own text by a row and the
    // rendered text appeared to stay on the previous line.
    block.style.height = `${line.heightPx}px`;
    block.style.lineHeight = `${line.heightPx}px`;
    block.style.marginTop = `${line.marginTopPx}px`;
    block.style.marginLeft = `${line.marginLeftPx}px`;
    block.style.whiteSpace = "pre";

    if (line.tokens.length === 0) {
      block.appendChild(document.createElement("br"));
    }
    for (const token of line.tokens) {
      block.appendChild(tokenSpan(token, opts));
    }
    fragment.appendChild(block);
  });
  el.replaceChildren(fragment);
}

function tokenSpan(token: PaintToken, opts: PaintOptions): HTMLSpanElement {
  const span = document.createElement("span");
  span.setAttribute(TOKEN_ATTR, "");
  span.textContent = token.text;
  span.dataset.adv = String(token.advancePx);
  span.dataset.src = token.text;
  applyFit(span, token, opts);
  return span;
}

function applyFit(
  span: HTMLSpanElement,
  token: PaintToken,
  opts: PaintOptions,
): void {
  const fit = tokenFitFor(token, opts);
  span.style.letterSpacing =
    fit.letterSpacingPx !== 0 ? `${fit.letterSpacingPx}px` : "";
  span.style.marginRight =
    fit.marginRightPx !== 0 ? `${fit.marginRightPx}px` : "";
}

export function refitTokens(el: HTMLElement, opts: PaintOptions): void {
  refit(el, opts, false);
}

/** Re-fit only the tokens the user has typed into - cheap enough per keystroke. */
export function refitEditedTokens(el: HTMLElement, opts: PaintOptions): void {
  refit(el, opts, true);
}

function refit(
  el: HTMLElement,
  opts: PaintOptions,
  changedOnly: boolean,
): void {
  for (const span of el.querySelectorAll<HTMLSpanElement>(`[${TOKEN_ATTR}]`)) {
    const advance = Number(span.dataset.adv);
    if (!Number.isFinite(advance)) continue;
    const text = span.textContent ?? "";
    const source = span.dataset.src ?? "";
    if (text === source) {
      // An estimate the user has since backspaced away is sized for text that
      // is no longer there, so replace it even on the per-keystroke pass.
      if (!changedOnly || span.dataset.est) {
        delete span.dataset.est;
        applyFit(span, { text, advancePx: advance }, opts);
      }
      continue;
    }
    const target = predictedAdvance(text, source, advance, opts);
    if (target === null) continue;
    span.dataset.est = "1";
    applyFit(span, { text, advancePx: target }, opts);
  }
}

/**
 * Where the PDF will advance the pen for a token the user has typed into.
 *
 * A token is painted at the width the PDF advances, not the width the browser
 * lays the same string out at - the two differ by 10-15% whenever the document
 * face isn't the one the browser has, and by a different amount per glyph. The
 * engine only re-measures once typing pauses, so until then each character is
 * priced from the document's own advances where the run already has that
 * character, and from the token's browser-to-PDF ratio where it does not.
 * Leaving the pre-edit fit in place instead smears a five-character correction
 * across a thirty-character word.
 */
function predictedAdvance(
  text: string,
  source: string,
  sourceAdvancePx: number,
  opts: PaintOptions,
): number | null {
  if (text === "" || source === "") return null;
  const sourceNatural = measureAdvancePx(source, opts.font);
  if (!(sourceNatural > 0) || !(sourceAdvancePx > 0)) return null;
  const ratio = sourceAdvancePx / sourceNatural;
  const table = opts.advanceEm;
  if (!table || table.size === 0) {
    const natural = measureAdvancePx(text, opts.font);
    return natural > 0 ? natural * ratio : null;
  }
  let total = 0;
  for (const ch of text) {
    const em = table.get(ch);
    total +=
      em === undefined
        ? measureAdvancePx(ch, opts.font) * ratio
        : em * opts.fontSizePx;
  }
  return total > 0 ? total : null;
}

function tokenFitFor(token: PaintToken, opts: PaintOptions): TokenFit {
  const natural = measureAdvancePx(token.text, opts.font);
  return fitTokenAdvance(
    [...token.text].length,
    natural,
    token.advancePx,
    opts.fontSizePx,
  );
}

export function paintPlainText(el: HTMLElement, text: string): void {
  el.innerText = text;
}

/**
 * Lines held by one painted line block.
 *
 * A recursive walk that emits one break per <br> - Firefox puts a manual break
 * INSIDE the token span it split, so the walk has to descend. Under the
 * blocks' `white-space: pre` this agrees with layout the way innerText does,
 * without innerText's forced layout flush (the old reader spent a flush per
 * block per keystroke). A block the browser emptied keeps a filler break that
 * would otherwise read as a newline of its own; the filler is not always a
 * direct <br> - pressing Enter at the end of a line leaves Chrome an empty
 * clone of the token span with the <br> inside it. An emptied block is one
 * empty line however the browser spells it, so key off the absence of text.
 */
function blockLines(element: HTMLElement): string[] {
  if ((element.textContent ?? "") === "") return [""];
  return flowLines(element);
}

// Merging two lines with Backspace leaves the lower one as an inline span on the upper one's line, not a line of its own.
const BLOCK_TAGS =
  /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TABLE|TR|SECTION|ARTICLE)$/;

function isLineElement(node: HTMLElement): boolean {
  return node.hasAttribute(LINE_ATTR) || BLOCK_TAGS.test(node.tagName);
}

function endsWithBreak(node: Node): boolean {
  let last: Node | null = node.lastChild;
  while (last && last.nodeType !== Node.TEXT_NODE && last.lastChild)
    last = last.lastChild;
  return last instanceof HTMLElement && last.tagName === "BR";
}

/** The text under `element`, split at every <br>. */
function flowLines(element: HTMLElement): string[] {
  const lines: string[] = [""];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      lines[lines.length - 1] += node.textContent ?? "";
      return;
    }
    if (node instanceof HTMLElement && node.tagName === "BR") {
      lines.push("");
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  for (const child of Array.from(element.childNodes)) walk(child);
  return lines;
}

/**
 * Read an overlay back into the model's plain text. The inverse of paintLines
 * and paintPlainText, so it lives beside them: when the two disagree about how
 * many lines the DOM holds, the run is re-emitted at the wrong baselines.
 */
export function readOverlayText(element: HTMLElement): string {
  const children = Array.from(element.childNodes);
  if (children.length === 0) return "";
  // Seeded with the line a leading <br> would terminate; without it a model
  // text starting with a newline lost its blank first line, pulling every line
  // below it up one leading.
  const lines: string[] = [""];
  let lastWasTrailingBr = false;
  let sawBlock = false;
  for (const node of children) {
    if (node.nodeType === Node.TEXT_NODE) {
      lines[lines.length - 1] += node.textContent ?? "";
      lastWasTrailingBr = false;
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName === "BR") {
      lines.push("");
      lastWasTrailingBr = true;
      continue;
    }
    if (!isLineElement(node)) {
      const [first, ...rest] = flowLines(node);
      lines[lines.length - 1] += first;
      lines.push(...rest);
      lastWasTrailingBr = rest.length > 0 && endsWithBreak(node);
      continue;
    }
    // Block children carry whole lines, so the seed is not one of them.
    if (!sawBlock && lines.length === 1 && lines[0] === "") lines.length = 0;
    sawBlock = true;
    for (const line of blockLines(node)) lines.push(line);
    lastWasTrailingBr = false;
  }
  // Browsers park a filler <br> at the end of a contenteditable; innerText
  // ignores it and so must we.
  if (lastWasTrailingBr) lines.pop();
  return lines.join("\n").replace(/\u00A0/g, " ");
}

export function isLinePainted(el: HTMLElement): boolean {
  return el.querySelector(`[${LINE_ATTR}]`) !== null;
}

function lineBlocks(el: HTMLElement): HTMLElement[] {
  return Array.from(el.children).filter(
    (c): c is HTMLElement =>
      c instanceof HTMLElement && c.hasAttribute(LINE_ATTR),
  );
}

/**
 * Characters of the run's model text that precede the caret. Computed by
 * reading a truncated clone through the SAME walk that produces the model
 * text, so any DOM the browser improvises mid-edit (a break inside a token
 * span, a stray sibling div Firefox wraps typed text in, a caret parked on
 * the container) yields an offset consistent with readOverlayText. The old
 * block-by-block count returned null for those shapes, the repaint then
 * skipped the restore, and the next keystroke landed at the start of the run.
 */
export function plainCaretOffset(el: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const { focusNode, focusOffset } = selection;
  return focusNode ? plainOffset(el, focusNode, focusOffset) : null;
}

/**
 * The characters of the run's model text the selection covers, counted as
 * plainCaretOffset counts; null for a caret or a selection that leaves `el`.
 */
export function plainSelectionRange(el: HTMLElement): TextRange | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  if (!anchorNode || !focusNode) return null;
  const anchor = plainOffset(el, anchorNode, anchorOffset);
  const focus = plainOffset(el, focusNode, focusOffset);
  if (anchor === null || focus === null || anchor === focus) return null;
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
}

function plainOffset(
  el: HTMLElement,
  node: Node,
  offset: number,
): number | null {
  if (!el.contains(node)) return null;
  const range = document.createRange();
  try {
    range.setStart(el, 0);
    range.setEnd(node, offset);
  } catch {
    return null;
  }
  const host = document.createElement("div");
  host.appendChild(range.cloneContents());
  let chars = readOverlayText(host).length;
  if (endsOnBreak(host) && !atEnd(el, node, offset)) chars += 1;
  // A caret parked on the container BETWEEN two line children sits at the
  // start of the next line - one past the end of the truncated text. Past the
  // last line child it belongs at that line's end, not on a fresh one.
  if (node === el) {
    const idx = Math.min(offset, el.childNodes.length);
    const children = Array.from(el.childNodes);
    const isLineChild = (n: Node) =>
      n instanceof HTMLElement && n.tagName !== "BR";
    if (
      children.slice(0, idx).some(isLineChild) &&
      children.slice(idx).some(isLineChild)
    ) {
      return chars + 1;
    }
  }
  return chars;
}

// readOverlayText drops a final <br> as the browser's filler, which it only is
// when nothing follows it in the real overlay.
function endsOnBreak(host: HTMLElement): boolean {
  const last = host.lastChild;
  return last instanceof HTMLElement && last.tagName === "BR";
}

function atEnd(el: HTMLElement, node: Node, offset: number): boolean {
  const rest = document.createRange();
  rest.setStart(node, offset);
  rest.setEnd(el, el.childNodes.length);
  const after = rest.cloneContents();
  return (after.textContent ?? "") === "" && after.querySelector("br") === null;
}

/**
 * Move a caret parked on the CONTAINER itself into the painted block it sits
 * beside. Left there, Firefox applies the next insertText as a bare sibling of
 * the line divs (often wrapped in a fresh div), which reads back as an extra
 * model line the user never typed.
 */
export function normalizeContainerCaret(
  el: HTMLElement,
  selection: Selection,
): void {
  if (selection.rangeCount === 0) return;
  // A CARET only. Firefox anchors a select-all on the container too, and
  // collapsing that just before a Delete turns "replace the line" into
  // "delete one character".
  if (!selection.isCollapsed) return;
  const { anchorNode, anchorOffset } = selection;
  if (anchorNode !== el) return;
  const blocks = lineBlocks(el);
  if (blocks.length === 0) return;
  // Container offset N sits between child N-1 and child N: land at the end of
  // the block before it (or the start of the first block for offset 0).
  let target: HTMLElement | null = null;
  for (
    let i = Math.min(anchorOffset, el.childNodes.length) - 1;
    i >= 0;
    i -= 1
  ) {
    const child = el.childNodes[i];
    if (child instanceof HTMLElement && child.hasAttribute(LINE_ATTR)) {
      target = child;
      break;
    }
  }
  if (target) {
    let node: Node = target;
    while (node.lastChild) node = node.lastChild;
    const at =
      node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "").length : 0;
    setCollapsed(selection, node, at);
    return;
  }
  let first: Node = blocks[0];
  while (first.firstChild) first = first.firstChild;
  setCollapsed(selection, first, 0);
}

export function restoreCaretOffset(el: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  const at = domPosition(el, offset);
  setCollapsed(selection, at.node, at.offset);
}

/** Run `paint`, which replaces the run's nodes, then put back the caret or selected range it held when `restore`. */
export function repaintKeepingSelection(
  el: HTMLElement,
  restore: boolean,
  paint: () => void,
): void {
  const selected = plainSelectionRange(el);
  const caret = plainCaretOffset(el);
  paint();
  if (!restore) return;
  const range = selected && plainDomRange(el, selected);
  const selection = window.getSelection();
  if (range && selection) {
    selection.removeAllRanges();
    selection.addRange(range);
  } else if (caret !== null) {
    restoreCaretOffset(el, caret);
  }
}

const TEXT_RANGE_HIGHLIGHT = "pdf-editor-text-range";

/**
 * Paint `range` as selected text, through the CSS Custom Highlight API, until
 * the returned cleanup runs. One range at a time: a later call replaces it.
 * Does nothing where the browser lacks the API.
 */
export function highlightTextRange(range: Range): () => void {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return () => {};
  const highlight = new Highlight(range);
  CSS.highlights.set(TEXT_RANGE_HIGHLIGHT, highlight);
  return () => {
    if (CSS.highlights.get(TEXT_RANGE_HIGHLIGHT) === highlight) {
      CSS.highlights.delete(TEXT_RANGE_HIGHLIGHT);
    }
  };
}

/**
 * A DOM range over the characters of the run's model text `range` covers,
 * counted as plainSelectionRange counts; null when the DOM cannot hold it.
 */
export function plainDomRange(el: HTMLElement, range: TextRange): Range | null {
  const from = domPosition(el, range.start);
  const to = domPosition(el, range.end);
  const out = document.createRange();
  try {
    out.setStart(from.node, from.offset);
    out.setEnd(to.node, to.offset);
  } catch {
    return null;
  }
  return out;
}

/**
 * Where character `offset` of the run's model text falls in the overlay's DOM.
 * Walks the DOM as readOverlayText reads it, so the two cannot disagree: a
 * child element is a line of its own, a <br> is a line break wherever it sits.
 */
function domPosition(
  el: HTMLElement,
  offset: number,
): { node: Node; offset: number } {
  const target = Math.max(0, offset);
  const children = Array.from(el.childNodes);
  let seen = 0;
  let started = false;
  let last: { node: Node; offset: number } = { node: el, offset: 0 };
  for (const [index, node] of children.entries()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = (node.nodeValue ?? "").length;
      if (seen + length >= target) return { node, offset: target - seen };
      seen += length;
      started = true;
      last = { node, offset: length };
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName === "BR") {
      if (seen === target) return { node: el, offset: index };
      seen += 1;
      started = true;
      last = { node: el, offset: index + 1 };
      continue;
    }
    if (!isLineElement(node)) {
      const flowed = flowPosition(node, target, seen);
      if (flowed.at) return flowed.at;
      seen = flowed.seen;
      started = true;
      if (flowed.last) last = flowed.last;
      continue;
    }
    if (started) {
      if (seen === target) return last;
      seen += 1;
    }
    started = true;
    const length =
      (node.textContent ?? "") === "" ? 0 : blockLines(node).join("\n").length;
    if (target <= seen + length)
      return length === 0
        ? { node, offset: 0 }
        : plainTextPosition(node, target - seen);
    seen += length;
    last = plainTextPosition(node, length);
  }
  return last;
}

// Plain text holds its line breaks as <br>, each one character of the model text.
function plainTextPosition(
  el: HTMLElement,
  target: number,
): { node: Node; offset: number } {
  const flowed = flowPosition(el, target, 0);
  return flowed.at ?? flowed.last ?? { node: el, offset: 0 };
}

function flowPosition(
  root: Node,
  target: number,
  from: number,
): {
  at: { node: Node; offset: number } | null;
  seen: number;
  last: { node: Node; offset: number } | null;
} {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  let seen = from;
  let last: { node: Node; offset: number } | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = (node.nodeValue ?? "").length;
      if (seen + length >= target)
        return { at: { node, offset: target - seen }, seen, last };
      seen += length;
      last = { node, offset: length };
      continue;
    }
    if (!(node instanceof HTMLElement) || node.tagName !== "BR") continue;
    const parent = node.parentNode!;
    const index = Array.prototype.indexOf.call(parent.childNodes, node);
    if (seen === target)
      return { at: { node: parent, offset: index }, seen, last };
    seen += 1;
    last = { node: parent, offset: index + 1 };
  }
  return { at: null, seen, last };
}

function setCollapsed(selection: Selection, node: Node, offset: number): void {
  const range = document.createRange();
  try {
    range.setStart(node, offset);
  } catch {
    range.selectNodeContents(node);
    range.collapse(false);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
