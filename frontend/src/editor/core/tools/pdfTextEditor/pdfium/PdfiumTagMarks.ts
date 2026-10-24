import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

const MCID = "MCID";
export const ARTIFACT_TAG = "Artifact";

/**
 * A marked-content tag that links a page object to the structure tree, or
 * excludes it from the tree as an artifact (ISO 32000-1 14.7.4, 14.8.2.2).
 */
export interface TagMark {
  name: string;
  /** The ID the structure tree refers to the content by; null for an artifact. */
  mcid: number | null;
}

/**
 * The tags on a page object, outermost first. Only tags that place content in
 * the structure tree are kept: an /ActualText or /Alt span describes the
 * original glyphs, so it must not follow edited text. Never throws: an
 * object whose marks cannot be read reads as untagged.
 */
export function readTagMarks(
  m: WrappedPdfiumModule,
  objPtr: number,
): TagMark[] {
  const tags: TagMark[] = [];
  try {
    const count = m.FPDFPageObj_CountMarks(objPtr);
    for (let i = 0; i < count; i++) {
      const mark = m.FPDFPageObj_GetMark(objPtr, i);
      if (!mark) continue;
      const name = markName(m, mark);
      const mcid = markMcid(m, mark);
      if (mcid !== null || name === ARTIFACT_TAG) tags.push({ name, mcid });
    }
  } catch {
    return [];
  }
  return tags;
}

/**
 * Give newly created objects the tags of the content they replace. Objects
 * that already carry a mark are left alone: PDFium appends a mark on every
 * call, and an emit that applies tags at more than one level would nest the
 * same tag twice.
 */
export function applyTagMarks(
  m: WrappedPdfiumModule,
  docPtr: number,
  ptrs: readonly number[],
  tags: readonly TagMark[],
): void {
  if (tags.length === 0) return;
  for (const ptr of ptrs) {
    if (!ptr || m.FPDFPageObj_CountMarks(ptr) > 0) continue;
    for (const tag of tags) {
      const mark = m.FPDFPageObj_AddMark(ptr, tag.name);
      if (mark && tag.mcid !== null) {
        m.FPDFPageObjMark_SetIntParam(docPtr, ptr, mark, MCID, tag.mcid);
      }
    }
  }
}

/** Carry `from`'s tags onto its replacement `to`. */
export function copyTagMarks(
  m: WrappedPdfiumModule,
  docPtr: number,
  from: number,
  to: number,
): void {
  applyTagMarks(m, docPtr, [to], readTagMarks(m, from));
}

function markName(m: WrappedPdfiumModule, mark: number): string {
  const lenPtr = scratchPtr(m, SCRATCH.tagNameLen, 4);
  if (!m.FPDFPageObjMark_GetName(mark, 0, 0, lenPtr)) return "";
  const byteLen = m.pdfium.getValue(lenPtr, "i32");
  if (byteLen <= 2) return "";
  const buf = scratchPtr(m, SCRATCH.tagName, byteLen);
  if (!m.FPDFPageObjMark_GetName(mark, buf, byteLen, lenPtr)) return "";
  return m.pdfium.UTF16ToString(buf);
}

function markMcid(m: WrappedPdfiumModule, mark: number): number | null {
  const out = scratchPtr(m, SCRATCH.tagMcid, 4);
  if (!m.FPDFPageObjMark_GetParamIntValue(mark, MCID, out)) return null;
  return m.pdfium.getValue(out, "i32");
}
