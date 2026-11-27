import {
  emitTextLine,
  measureObjSpanPt,
  removeAndDestroyObject,
  withoutDroppedChars,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { uniformTags } from "@editor/tools/pdfTextEditor/model/TextTags";
import { familyOf } from "@editor/tools/pdfTextEditor/util/fontFamily";

export function lineWidthIn(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
): (line: string) => number {
  const m = doc.module;
  const font = run.pdfiumObjPtr ? m.FPDFTextObj_GetFont(run.pdfiumObjPtr) : 0;
  const widths = new Map<string, number>();
  return (line) => {
    let width = widths.get(line);
    if (width !== undefined) return width;
    const ptrs = withoutDroppedChars(() =>
      emitTextLine({
        doc,
        page,
        text: line,
        x: 0,
        y: 0,
        fontSize: run.fontSize,
        fill: run.fill,
        originalFontPtr: font,
        fallbackFamily: familyOf(run.fontId),
        tags: uniformTags([]),
      }),
    );
    const span = measureObjSpanPt(m, ptrs);
    for (const ptr of ptrs) removeAndDestroyObject(m, page.pagePtr, ptr);
    width = span ? span.right - span.left : 0;
    widths.set(line, width);
    return width;
  };
}

export function wrapEachLine(
  text: string,
  fits: (line: string) => boolean,
): string {
  return text
    .split("\n")
    .map((line) => wrapLine(line, fits))
    .join("\n");
}

function wrapLine(line: string, fits: (line: string) => boolean): string {
  const chars = [...line];
  let start = 0;
  while (!fits(chars.slice(start).join("").trim())) {
    const spaces: number[] = [];
    for (let i = start + 1; i < chars.length; i++)
      if (chars[i] === " " && chars[i - 1] !== " ") spaces.push(i);
    if (spaces.length === 0) break;
    let lo = 0;
    let hi = spaces.length - 1;
    let at = spaces[0];
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (fits(chars.slice(start, spaces[mid]).join("").trim())) {
        at = spaces[mid];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    chars[at] = "\n";
    start = at + 1;
  }
  return chars.join("");
}
