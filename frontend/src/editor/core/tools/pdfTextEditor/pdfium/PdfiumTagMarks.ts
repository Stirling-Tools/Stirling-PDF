import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { ArtifactKind } from "@editor/tools/pdfTextEditor/model/artifactKind";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

const MCID = "MCID";
const TYPE = "Type";
const SUBTYPE = "Subtype";
const FPDF_PAGEOBJ_FORM = 5;
const FPDF_OBJECT_STRING = 3;
const FPDF_OBJECT_NAME = 4;
export const ARTIFACT_TAG = "Artifact";

/**
 * The kinds a document read from its file for artifact marks whose /Type
 * PDFium holds as a name, which it cannot return: by mark pointer, per
 * module, since every document's marks come from the one heap. Each names
 * the document that read it, which drops its own when disposed.
 */
const fileKinds = new WeakMap<
  WrappedPdfiumModule,
  Map<number, { kind: ArtifactKind; owner: object }>
>();

/**
 * A marked-content tag that links a page object to the structure tree, or
 * excludes it from the tree as an artifact (ISO 32000-1 14.7.4, 14.8.2.2).
 */
export interface TagMark {
  name: string;
  /** The ID the structure tree refers to the content by; null for an artifact. */
  mcid: number | null;
  /**
   * What an artifact is: from the strings the editor writes, which the save
   * turns into names (nameArtifactKinds), or from the file's names once its
   * document has read them (registerArtifactKinds). Absent until then.
   */
  artifact?: ArtifactKind;
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
      if (name === ARTIFACT_TAG) {
        const artifact = artifactKind(m, mark);
        tags.push(artifact ? { name, mcid, artifact } : { name, mcid });
      } else if (mcid !== null) {
        tags.push({ name, mcid });
      }
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
  const param = (key: string, value: string | null) =>
    value === null ||
    m.FPDFPageObjMark_SetStringParam(docPtr, objPtr, mark, key, value);
  return (
    (tag.mcid === null ||
      m.FPDFPageObjMark_SetIntParam(docPtr, objPtr, mark, MCID, tag.mcid)) &&
    (!tag.artifact ||
      (param(TYPE, tag.artifact.type) && param(SUBTYPE, tag.artifact.subtype)))
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
  let highest = -1;
  for (const mcid of carriedMcids(m, pagePtr))
    highest = Math.max(highest, mcid);
  return highest;
}

/** Every MCID any object on the page is marked with, form XObject content included. */
export function carriedMcids(
  m: WrappedPdfiumModule,
  pagePtr: number,
): Set<number> {
  const count = m.FPDFPage_CountObjects(pagePtr);
  const objects = Array.from({ length: count }, (_, i) =>
    m.FPDFPage_GetObject(pagePtr, i),
  );
  const carried = new Set<number>();
  while (objects.length > 0) {
    const objPtr = objects.pop()!;
    if (!objPtr) continue;
    for (const tag of readTagMarks(m, objPtr)) {
      if (tag.mcid !== null) carried.add(tag.mcid);
    }
    if (m.FPDFPageObj_GetType(objPtr) !== FPDF_PAGEOBJ_FORM) continue;
    for (let i = 0; i < m.FPDFFormObj_CountObjects(objPtr); i++) {
      objects.push(m.FPDFFormObj_GetObject(objPtr, i));
    }
  }
  return carried;
}

/**
 * True when an object on the page, form XObject content included, is marked
 * an artifact of a kind PDFium writes as strings, which the save must turn
 * into names (nameArtifactKinds).
 */
export function writesArtifactKinds(
  m: WrappedPdfiumModule,
  pagePtr: number,
): boolean {
  const count = m.FPDFPage_CountObjects(pagePtr);
  const objects = Array.from({ length: count }, (_, i) =>
    m.FPDFPage_GetObject(pagePtr, i),
  );
  while (objects.length > 0) {
    const objPtr = objects.pop()!;
    if (!objPtr) continue;
    for (let i = 0; i < m.FPDFPageObj_CountMarks(objPtr); i++) {
      const mark = m.FPDFPageObj_GetMark(objPtr, i);
      if (mark && artifactType(m, mark) === FPDF_OBJECT_STRING) return true;
    }
    if (m.FPDFPageObj_GetType(objPtr) !== FPDF_PAGEOBJ_FORM) continue;
    for (let i = 0; i < m.FPDFFormObj_CountObjects(objPtr); i++) {
      objects.push(m.FPDFFormObj_GetObject(objPtr, i));
    }
  }
  return false;
}

/** An artifact mark whose /Type PDFium holds as a name. */
export interface ArtifactMarkRef {
  ptr: number;
  /** Its parameter count, and whether /Subtype is a name among them: to check the file's sequence it pairs with. */
  entries: number;
  subtyped: boolean;
}

/**
 * The artifact marks on the page's own objects whose /Type is a name, each
 * once, in the order the content opens them. Form XObject content is left
 * out. Never throws.
 */
export function artifactMarkRefs(
  m: WrappedPdfiumModule,
  pagePtr: number,
): ArtifactMarkRef[] {
  const refs: ArtifactMarkRef[] = [];
  const seen = new Set<number>();
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const objPtr = m.FPDFPage_GetObject(pagePtr, i);
      if (!objPtr) continue;
      for (let j = 0; j < m.FPDFPageObj_CountMarks(objPtr); j++) {
        const mark = m.FPDFPageObj_GetMark(objPtr, j);
        if (!mark || seen.has(mark)) continue;
        seen.add(mark);
        if (artifactType(m, mark) !== FPDF_OBJECT_NAME) continue;
        refs.push({
          ptr: mark,
          entries: m.FPDFPageObjMark_CountParams(mark),
          subtyped:
            m.FPDFPageObjMark_GetParamValueType(mark, SUBTYPE) ===
            FPDF_OBJECT_NAME,
        });
      }
    }
  } catch {
    return [];
  }
  return refs;
}

/** Record kinds `owner` read from its file, by mark pointer, for readTagMarks to return. */
export function registerArtifactKinds(
  m: WrappedPdfiumModule,
  owner: object,
  kinds: ReadonlyMap<number, ArtifactKind>,
): void {
  let registered = fileKinds.get(m);
  if (!registered) {
    registered = new Map();
    fileKinds.set(m, registered);
  }
  for (const [ptr, kind] of kinds) registered.set(ptr, { kind, owner });
}

/**
 * Drop the kinds recorded for marks `ptrs`, as a page is first read: a mark
 * an edit freed can come back at the same address when another page is.
 */
export function forgetArtifactMarks(
  m: WrappedPdfiumModule,
  ptrs: Iterable<number>,
): void {
  const registered = fileKinds.get(m);
  for (const ptr of ptrs) registered?.delete(ptr);
}

/** Drop every kind `owner` recorded. */
export function forgetArtifactKinds(
  m: WrappedPdfiumModule,
  owner: object,
): void {
  const registered = fileKinds.get(m);
  for (const [ptr, entry] of registered ?? []) {
    if (entry.owner === owner) registered!.delete(ptr);
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

/** The artifact mark's kind, from its strings or the kinds read from the file; undefined when neither gives one. */
function artifactKind(
  m: WrappedPdfiumModule,
  mark: number,
): ArtifactKind | undefined {
  const type = stringParam(m, mark, TYPE);
  if (type !== null) return { type, subtype: stringParam(m, mark, SUBTYPE) };
  // Only a mark read from the file has a name: one the editor adds at a
  // freed mark's address must not take that mark's kind.
  if (m.FPDFPageObjMark_GetParamValueType(mark, TYPE) !== FPDF_OBJECT_NAME) {
    return undefined;
  }
  return fileKinds.get(m)?.get(mark)?.kind;
}

/** The object type of an artifact mark's /Type; 0 for any other mark, or one without. */
function artifactType(m: WrappedPdfiumModule, mark: number): number {
  if (markName(m, mark) !== ARTIFACT_TAG) return 0;
  return m.FPDFPageObjMark_GetParamValueType(mark, TYPE);
}

/** The mark's string parameter `key`; null when it has none, or a value of another type. */
function stringParam(
  m: WrappedPdfiumModule,
  mark: number,
  key: string,
): string | null {
  const lenPtr = scratchPtr(m, SCRATCH.tagParamLen, 4);
  if (!m.FPDFPageObjMark_GetParamStringValue(mark, key, 0, 0, lenPtr)) {
    return null;
  }
  const byteLen = m.pdfium.getValue(lenPtr, "i32");
  if (byteLen <= 2) return "";
  const buf = scratchPtr(m, SCRATCH.tagParam, byteLen);
  if (!m.FPDFPageObjMark_GetParamStringValue(mark, key, buf, byteLen, lenPtr)) {
    return null;
  }
  return m.pdfium.UTF16ToString(buf);
}

function markMcid(m: WrappedPdfiumModule, mark: number): number | null {
  const out = scratchPtr(m, SCRATCH.tagMcid, 4);
  if (!m.FPDFPageObjMark_GetParamIntValue(mark, MCID, out)) return null;
  return m.pdfium.getValue(out, "i32");
}
