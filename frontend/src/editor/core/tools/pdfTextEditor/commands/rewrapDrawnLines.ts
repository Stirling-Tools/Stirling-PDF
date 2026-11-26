import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  softStartsFor,
  softStartsOf,
} from "@editor/tools/pdfTextEditor/pdfium/lineBreaks";
import {
  drawnCodePoint,
  drawnText,
} from "@editor/tools/pdfTextEditor/pdfium/lineEndHyphen";

interface Token {
  start: number;
  end: number;
  left: number;
  right: number;
  line: number;
}

/**
 * `run`'s text re-broken to `maxWidthPt` when its lines are drawn as whole
 * line objects, which a reflow cannot split because it only moves objects;
 * null when its objects are already per word or glyph, or its letters cannot
 * be lined up with the page's. Only whitespace changes: soft breaks join, and
 * a break replaces the space before a word that would pass the width.
 */
export function rewrapDrawnLines(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  maxWidthPt: number,
): string | null {
  const ptrs = new Set(
    run.paragraphLeafPtrs.length > 0
      ? run.paragraphLeafPtrs
      : run.mergedFromPtrs.length > 0
        ? run.mergedFromPtrs
        : [run.pdfiumObjPtr],
  );
  page.flushGenerate(doc.module);
  const boxes = letterBoxes(doc, page, ptrs);
  if (!boxes) return null;
  const tokens = tokensOf(run.text, boxes);
  if (!tokens || !tokens.some((t, i) => tokens[i + 1]?.line === t.line))
    return null;
  if (boxes.objects >= tokens.length) return null;

  const soft = softStartsOf(run);
  const startX = Math.min(...tokens.map((t) => t.left));
  const space = medianGap(tokens) ?? run.fontSize * 0.25;
  const chars = [...run.text];
  if (chars.length !== run.text.length) return null;
  let cursor = startX;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prev = tokens[i - 1];
    const width = token.right - token.left;
    if (prev) {
      const between = run.text.slice(prev.end, token.start);
      const breaks = [...between].filter((ch) => ch === "\n").length;
      const hard = breaks > 1 || (breaks === 1 && !soft[token.line]);
      const gap =
        prev.line === token.line ? Math.max(0, token.left - prev.right) : space;
      if (hard) {
        cursor = startX;
      } else if (cursor + gap + width > startX + maxWidthPt + 0.5) {
        setSeparator(chars, prev.end, token.start, "\n");
        cursor = startX;
      } else {
        if (breaks === 1) setSeparator(chars, prev.end, token.start, " ");
        cursor += gap;
      }
    }
    cursor += width;
  }
  return chars.join("");
}

/** The resize of a run drawn as whole line objects: its text rewritten with new breaks, keeping the width the user chose. */
export class RewrapTextCommand implements Command {
  readonly type = "rewrap-text";
  private readonly edit: EditTextCommand;
  private prev: {
    width: number | null;
    softStarts: boolean[];
    softStartsText: string;
  } | null = null;

  constructor(
    private readonly pageIndex: number,
    private readonly runId: string,
    nextText: string,
    private readonly widthPt: number,
  ) {
    this.edit = new EditTextCommand({
      pageIndex,
      runId,
      nextText,
      explicit: true,
    });
  }

  apply(doc: EditorDocument): void {
    const run = doc.page(this.pageIndex).findRun(this.runId);
    if (!run) return;
    const prevText = run.text;
    const softStarts = softStartsOf(run);
    this.prev = {
      width: run.wrapWidthPt,
      softStarts: run.paragraphSoftStarts,
      softStartsText: run.paragraphSoftStartsText,
    };
    this.edit.apply(doc);
    run.wrapWidthPt = this.widthPt;
    run.paragraphSoftStarts = softStartsFor(run.text, prevText, softStarts);
    run.paragraphSoftStartsText = run.text;
  }

  revert(doc: EditorDocument): void {
    this.edit.revert(doc);
    const run = doc.page(this.pageIndex).findRun(this.runId);
    if (!run || !this.prev) return;
    run.wrapWidthPt = this.prev.width;
    run.paragraphSoftStarts = this.prev.softStarts;
    run.paragraphSoftStartsText = this.prev.softStartsText;
  }

  describe(): string {
    return this.edit.describe?.() ?? this.type;
  }

  coalesceKey(): string | null {
    return null;
  }
}

interface LetterBoxes {
  letters: Array<{ char: string; left: number; right: number }>;
  objects: number;
}

// The page's non-space letters drawn by `ptrs`, in the text page's order,
// which is reading order for the lines of one paragraph.
function letterBoxes(
  doc: EditorDocument,
  page: Page,
  ptrs: ReadonlySet<number>,
): LetterBoxes | null {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(page.pagePtr);
  const buf = m.pdfium.wasmExports.malloc(32);
  const letters: LetterBoxes["letters"] = [];
  const seen = new Set<number>();
  try {
    const count = m.FPDFText_CountChars(textPage);
    for (let i = 0; i < count; i++) {
      const object = m.FPDFText_GetTextObject(textPage, i);
      if (!ptrs.has(object)) continue;
      const code = drawnCodePoint(m.FPDFText_GetUnicode(textPage, i));
      if (code === 0 || /\s/.test(String.fromCodePoint(code))) continue;
      if (!m.FPDFText_GetCharBox(textPage, i, buf, buf + 8, buf + 16, buf + 24))
        return null;
      seen.add(object);
      letters.push({
        char: drawnText(String.fromCodePoint(code)),
        left: m.pdfium.getValue(buf, "double"),
        right: m.pdfium.getValue(buf + 8, "double"),
      });
    }
  } finally {
    m.pdfium.wasmExports.free(buf);
    m.FPDFText_ClosePage(textPage);
  }
  return letters.length > 0 ? { letters, objects: seen.size } : null;
}

function tokensOf(text: string, boxes: LetterBoxes): Token[] | null {
  const tokens: Token[] = [];
  let letter = 0;
  let line = 0;
  const re = /\S+|\n/g;
  for (const match of text.matchAll(re)) {
    if (match[0] === "\n") {
      line++;
      continue;
    }
    const first = boxes.letters[letter];
    for (const ch of match[0])
      if (boxes.letters[letter++]?.char !== ch) return null;
    const last = boxes.letters[letter - 1];
    if (!first || !last) return null;
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      left: first.left,
      right: last.right,
      line,
    });
  }
  return letter === boxes.letters.length ? tokens : null;
}

function medianGap(tokens: Token[]): number | null {
  const gaps = tokens
    .slice(1)
    .map((t, i) => (t.line === tokens[i].line ? t.left - tokens[i].right : -1))
    .filter((g) => g > 0)
    .sort((a, b) => a - b);
  return gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)] : null;
}

function setSeparator(
  chars: string[],
  from: number,
  to: number,
  separator: " " | "\n",
): void {
  for (let i = from; i < to; i++)
    if (chars[i] === "\n" || chars[i] === " ") {
      chars[i] = separator;
      for (let j = i + 1; j < to; j++) if (chars[j] === "\n") chars[j] = " ";
      return;
    }
}
