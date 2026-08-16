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
  for (const span of el.querySelectorAll<HTMLSpanElement>(`[${TOKEN_ATTR}]`)) {
    const advance = Number(span.dataset.adv);
    if (!Number.isFinite(advance)) continue;
    const text = span.textContent ?? "";
    if (text !== span.dataset.src) continue;
    applyFit(span, { text, advancePx: advance }, opts);
  }
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

function isBr(node: Node): boolean {
  return node instanceof HTMLElement && node.tagName === "BR";
}

/**
 * Lines held by one painted line block.
 *
 * innerText is the only reader that agrees with layout about where a block
 * breaks - Firefox puts a manual break INSIDE the token span it split, which no
 * child walk sees. The single case it gets wrong is a block the browser
 * emptied, which keeps a filler <br> that innerText reports as a newline of its
 * own; that inserted a phantom line and shoved every line below it down the
 * page. So: special-case that one shape, and trust innerText for the rest.
 */
function blockLines(element: HTMLElement): string[] {
  const kids = element.childNodes;
  if (kids.length === 1 && isBr(kids[0])) return [""];
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

function textOffsetWithin(
  root: HTMLElement,
  node: Node,
  offset: number,
): number | null {
  if (!root.contains(node)) return null;
  if (node === root) {
    let total = 0;
    for (let i = 0; i < offset && i < root.childNodes.length; i += 1) {
      total += (root.childNodes[i].textContent ?? "").length;
    }
    return total;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current = walker.nextNode();
  while (current) {
    if (current === node) return total + offset;
    total += (current.nodeValue ?? "").length;
    current = walker.nextNode();
  }
  return null;
}

export function plainCaretOffset(el: HTMLElement): number | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const { focusNode, focusOffset } = selection;
  if (!focusNode || !el.contains(focusNode)) return null;

  const blocks = lineBlocks(el);
  if (blocks.length === 0) return textOffsetWithin(el, focusNode, focusOffset);

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
