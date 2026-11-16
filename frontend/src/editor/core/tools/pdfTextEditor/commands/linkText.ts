import {
  leaves,
  type Leaf,
} from "@editor/tools/pdfTextEditor/commands/runLeaves";
import { nextMatch } from "@editor/tools/pdfTextEditor/commands/textPieces";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import {
  areaContains,
  type LinkAnnotation,
} from "@editor/tools/pdfTextEditor/model/LinkAnnotation";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

/** The stretch of a run's text, in code units, that a link covers. */
export interface LinkText {
  runId: string;
  start: number;
  end: number;
}

interface Covered {
  ptr: number;
  annotation: number;
  runId: string;
  start: number;
  end: number;
}

/**
 * The run text each of `links` covers, by annotation: from the first to the
 * last character whose box's centre is in one of its areas. A link over no
 * text, or over text of more than one run, is left out. The page must
 * already be read.
 */
export function linkTexts(
  doc: EditorDocument,
  pageIndex: number,
  links: readonly LinkAnnotation[],
): Map<number, LinkText> {
  if (links.length === 0) return new Map();
  const byAnnotation = new Map<number, Covered[]>();
  for (const char of coveredCharacters(doc, pageIndex, links)) {
    const chars = byAnnotation.get(char.annotation) ?? [];
    chars.push(char);
    byAnnotation.set(char.annotation, chars);
  }
  const out = new Map<number, LinkText>();
  for (const [annotation, chars] of byAnnotation) {
    const runs = new Set(chars.map((char) => char.runId));
    if (runs.size !== 1) continue;
    out.set(annotation, {
      runId: chars[0].runId,
      start: Math.min(...chars.map((char) => char.start)),
      end: Math.max(...chars.map((char) => char.end)),
    });
  }
  return out;
}

/**
 * Each inked character a run lists that falls in a link's areas. The text
 * page's characters for an object are matched to its text in order, as
 * charOrigins does; an object whose characters do not spell its text is left
 * out, since none of its places can be trusted.
 */
function coveredCharacters(
  doc: EditorDocument,
  pageIndex: number,
  links: readonly LinkAnnotation[],
): Covered[] {
  const m = doc.module;
  const page = doc.page(pageIndex);
  const leafOf = new Map<number, Leaf>();
  for (const run of page.runs) {
    for (const leaf of leaves(run) ?? []) leafOf.set(leaf.ptr, leaf);
  }
  const covered: Covered[] = [];
  const read = new Map<number, number>();
  const untrusted = new Set<number>();
  const textPage = m.FPDFText_LoadPage(page.pagePtr);
  if (!textPage) return [];
  try {
    const box = scratchPtr(m, SCRATCH.linkCharBox, 32);
    const count = m.FPDFText_CountChars(textPage);
    for (let i = 0; i < count; i++) {
      const ptr = m.FPDFText_GetTextObject(textPage, i);
      const leaf = leafOf.get(ptr);
      if (!leaf || untrusted.has(ptr)) continue;
      if (m.FPDFText_IsGenerated(textPage, i) === 1) continue;
      const char = String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i));
      const at = nextMatch(leaf.text, read.get(ptr) ?? 0, char);
      if (at === null) {
        untrusted.add(ptr);
        continue;
      }
      read.set(ptr, at + char.length);
      if (!/\S/.test(char)) continue;
      if (
        !m.FPDFText_GetCharBox(textPage, i, box, box + 8, box + 16, box + 24)
      ) {
        continue;
      }
      const [left, right, bottom, top] = [0, 8, 16, 24].map((offset) =>
        m.pdfium.getValue(box + offset, "double"),
      );
      const centre = { x: (left + right) / 2, y: (bottom + top) / 2 };
      for (const { annotation, areas } of links) {
        if (!areas.some((area) => areaContains(area, centre))) continue;
        const start = leaf.start + at;
        covered.push({
          ptr,
          annotation,
          runId: leaf.run.id,
          start,
          end: start + char.length,
        });
      }
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
  }
  for (const [ptr, leaf] of leafOf) {
    if (/\S/.test(leaf.text.slice(read.get(ptr) ?? 0))) untrusted.add(ptr);
  }
  return covered.filter((char) => !untrusted.has(char.ptr));
}
