import {
  fitTokenAdvance,
  type TokenFit,
} from "@app/tools/pdfTextEditor/v2/util/lineLayout";
import { measureAdvancePx } from "@app/tools/pdfTextEditor/v2/util/textMetrics";

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

const LINE_ATTR = "data-v2-line";
const TOKEN_ATTR = "data-v2-token";

export function paintLines(
  el: HTMLElement,
  lines: PaintLine[],
  opts: PaintOptions,
): void {
  const fragment = document.createDocumentFragment();
  lines.forEach((line, index) => {
    const block = document.createElement("div");
    block.setAttribute(LINE_ATTR, String(index));
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
 * innerText is the only reader that agrees with layout about where a block
 * breaks - Firefox puts a manual break INSIDE the token span it split, which no
 * child walk sees. The single case it gets wrong is a block the browser
 * emptied, which keeps a filler break that innerText reports as a newline of
 * its own; that inserts a phantom line and shoves every line below it down the
 * page. The filler is not always a direct <br>: pressing Enter at the end of a
 * line leaves Chrome an empty clone of the token span with the <br> inside it.
 * An emptied block is one empty line however the browser spells it, so key off
 * the absence of text rather than the shape holding it.
 */
function blockLines(element: HTMLElement): string[] {
  if ((element.textContent ?? "") === "") return [""];
  // textContent is the jsdom fallback: innerText needs layout, so unit tests
  // exercise structure while the browser suites cover the layout-driven cases.
  const text = element.innerText ?? element.textContent ?? "";
  return text.split("\n");
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

// Characters of `root` that precede (node, offset). A caret does not always sit
// in a text node - pressing Enter parks it inside the empty token span Chrome
// left behind - and a tree walk over text nodes alone reports nothing for those
// positions, which loses the caret on the next repaint.
function textOffsetWithin(
  root: HTMLElement,
  node: Node,
  offset: number,
): number | null {
  if (!root.contains(node)) return null;
  const range = document.createRange();
  try {
    range.setStart(root, 0);
    range.setEnd(node, offset);
  } catch {
    return null;
  }
  return range.toString().length;
}

function containerCaretOffset(el: HTMLElement, offset: number): number | null {
  const chars = textOffsetWithin(el, el, offset);
  if (chars === null) return null;
  let crossed = 0;
  for (let i = 0; i < offset && i < el.childNodes.length; i += 1) {
    const child = el.childNodes[i];
    if (child instanceof HTMLElement && child.hasAttribute(LINE_ATTR)) {
      crossed += 1;
    }
  }
  // A caret past the last block belongs at that line's end, not on a fresh one.
  const trailing = offset >= el.childNodes.length ? 1 : 0;
  return chars + Math.max(0, crossed - trailing);
}

export function plainCaretOffset(el: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const { focusNode, focusOffset } = selection;
  if (!focusNode || !el.contains(focusNode)) return null;

  const blocks = lineBlocks(el);
  if (blocks.length === 0) return textOffsetWithin(el, focusNode, focusOffset);
  // Parked on the container itself: the offset counts CHILD BLOCKS, so add back
  // the newline each completed block stands for.
  if (focusNode === el) return containerCaretOffset(el, focusOffset);

  let before = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.contains(focusNode) || block === focusNode) {
      const within = textOffsetWithin(block, focusNode, focusOffset);
      return within === null ? null : before + within;
    }
    before += (block.textContent ?? "").length + 1;
  }
  return null;
}

export function restoreCaretOffset(el: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  const target = Math.max(0, offset);

  const blocks = lineBlocks(el);
  let scope: HTMLElement = el;
  let remaining = target;
  if (blocks.length > 0) {
    scope = blocks[blocks.length - 1];
    remaining = (scope.textContent ?? "").length;
    let before = 0;
    for (const block of blocks) {
      const length = (block.textContent ?? "").length;
      if (target <= before + length) {
        scope = block;
        remaining = target - before;
        break;
      }
      before += length + 1;
    }
  }

  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let node = walker.nextNode();
  while (node) {
    const length = (node.nodeValue ?? "").length;
    if (seen + length >= remaining) {
      setCollapsed(selection, node, remaining - seen);
      return;
    }
    seen += length;
    node = walker.nextNode();
  }
  setCollapsed(selection, scope, 0);
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
