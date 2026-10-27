import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

const MCID = "MCID";
const FPDF_PAGEOBJ_FORM = 5;
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

/** The MCID of the innermost tag that has one: the content's own. */
export function innermostMcid(tags: readonly TagMark[]): number | null {
  return [...tags].reverse().find((t) => t.mcid !== null)?.mcid ?? null;
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
    for (const tag of tags) addTagMark(m, docPtr, ptr, tag);
  }
}

/** Add `tag` to the object, innermost. False when PDFium refuses it. */
export function addTagMark(
  m: WrappedPdfiumModule,
  docPtr: number,
  objPtr: number,
  tag: TagMark,
): boolean {
  const mark = m.FPDFPageObj_AddMark(objPtr, tag.name);
  if (!mark) return false;
  return (
    tag.mcid === null ||
    m.FPDFPageObjMark_SetIntParam(docPtr, objPtr, mark, MCID, tag.mcid)
  );
}

/** Remove the object's innermost tag named `name`. False when it has none. */
export function removeTagMark(
  m: WrappedPdfiumModule,
  objPtr: number,
  name: string,
): boolean {
  for (let i = m.FPDFPageObj_CountMarks(objPtr) - 1; i >= 0; i--) {
    const mark = m.FPDFPageObj_GetMark(objPtr, i);
    if (mark && markName(m, mark) === name) {
      return m.FPDFPageObj_RemoveMark(objPtr, mark);
    }
  }
  return false;
}

/**
 * The highest MCID any object on the page is marked with, form XObject
 * content included; -1 when none is.
 */
export function highestMcid(m: WrappedPdfiumModule, pagePtr: number): number {
  const count = m.FPDFPage_CountObjects(pagePtr);
  const objects = Array.from({ length: count }, (_, i) =>
    m.FPDFPage_GetObject(pagePtr, i),
  );
  let highest = -1;
  while (objects.length > 0) {
    const objPtr = objects.pop()!;
    if (!objPtr) continue;
    for (const tag of readTagMarks(m, objPtr)) {
      highest = Math.max(highest, tag.mcid ?? -1);
    }
    if (m.FPDFPageObj_GetType(objPtr) !== FPDF_PAGEOBJ_FORM) continue;
    for (let i = 0; i < m.FPDFFormObj_CountObjects(objPtr); i++) {
      objects.push(m.FPDFFormObj_GetObject(objPtr, i));
    }
  }
  return highest;
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
