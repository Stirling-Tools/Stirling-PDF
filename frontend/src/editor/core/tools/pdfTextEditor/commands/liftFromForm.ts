import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { ImageObject } from "@editor/tools/pdfTextEditor/model/ImageObject";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  collectContainersByPtr,
  restoreContentOrder,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { isScanRun } from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { readMatrix } from "@editor/tools/pdfTextEditor/commands/textPieces";
import { transformObject } from "@editor/tools/pdfTextEditor/util/objectTransform";

// PDFium writes a form XObject's stream back out only when an object is taken
// out of it: moving, recolouring or resizing an object inside a form shows on
// screen and is gone from the saved file. An object on the page itself saves
// every change, so a run is lifted out of its form before anything edits it.

interface FormModule {
  FPDFFormObj_CountObjects?: (form: number) => number;
  FPDFFormObj_GetObject?: (form: number, index: number) => number;
  FPDFFormObj_RemoveObject?: (form: number, obj: number) => boolean;
}

const FPDF_PAGEOBJ_FORM = 5;
// As deep as the reader walks: a run is never found in a form nested further.
const MAX_FORM_DEPTH = 4;

// The forms from the page down to `wanted`, outermost first; null when `form` does not lead to it.
function chainFrom(
  m: WrappedPdfiumModule,
  form: number,
  wanted: number,
  depth: number,
): number[] | null {
  if (form === wanted) return [form];
  const mod = m as unknown as FormModule;
  if (depth >= MAX_FORM_DEPTH || !mod.FPDFFormObj_CountObjects) return null;
  const count = mod.FPDFFormObj_CountObjects(form);
  for (let i = 0; i < count; i++) {
    const child = mod.FPDFFormObj_GetObject?.(form, i) ?? 0;
    if (!child || m.FPDFPageObj_GetType(child) !== FPDF_PAGEOBJ_FORM) continue;
    const rest = chainFrom(m, child, wanted, depth + 1);
    if (rest) return [form, ...rest];
  }
  return null;
}

function chainTo(
  m: WrappedPdfiumModule,
  pagePtr: number,
  form: number,
): number[] | null {
  const count = m.FPDFPage_CountObjects(pagePtr);
  for (let i = 0; i < count; i++) {
    const top = m.FPDFPage_GetObject(pagePtr, i);
    if (!top || m.FPDFPageObj_GetType(top) !== FPDF_PAGEOBJ_FORM) continue;
    const chain = chainFrom(m, top, form, 1);
    if (chain) return chain;
  }
  return null;
}

function indexOnPage(
  m: WrappedPdfiumModule,
  pagePtr: number,
  ptr: number,
): number {
  const count = m.FPDFPage_CountObjects(pagePtr);
  for (let i = 0; i < count; i++)
    if (m.FPDFPage_GetObject(pagePtr, i) === ptr) return i;
  return count - 1;
}

// Takes `ptr` out of `form`, which must sit on the page itself, and draws it from the page in the same place, just above the form.
function moveOutOf(
  m: WrappedPdfiumModule,
  pagePtr: number,
  form: number,
  ptrs: number[],
): boolean {
  const remove = (m as unknown as FormModule).FPDFFormObj_RemoveObject;
  const matrix = readMatrix(m, form);
  if (!remove || !matrix) return false;
  const [a, b, c, d, e, f] = matrix;
  const moved: number[] = [];
  for (const ptr of ptrs) {
    if (!remove(form, ptr)) continue;
    transformObject(m, ptr, a, b, c, d, e, f);
    m.FPDFPage_InsertObject(pagePtr, ptr);
    moved.push(ptr);
  }
  const above = indexOnPage(m, pagePtr, form) + 1;
  restoreContentOrder(
    m,
    pagePtr,
    moved.map((ptr, i) => ({ ptr, index: above + i })),
  );
  return moved.length === ptrs.length;
}

/**
 * Moves `ptrs` out of the form XObject `container` onto the page, drawn
 * exactly where the form drew them. PDFium saves a removal only from a form
 * the page draws directly, so a form nested in another is itself moved onto
 * the page first, one level at a time. Not undone: the page looks the same
 * before and after, and PDFium has no call to put an object back into a form.
 *
 * Returns false when something could not be moved; what did move stays moved.
 */
export function liftObjectsToPage(
  doc: EditorDocument,
  page: Page,
  container: number,
  ptrs: number[],
): boolean {
  const m = doc.module;
  const chain = chainTo(m, page.pagePtr, container);
  if (!chain) return false;
  for (let level = 1; level < chain.length; level++)
    if (!moveOutOf(m, page.pagePtr, chain[level - 1], [chain[level]]))
      return false;
  const lifted = moveOutOf(m, page.pagePtr, container, ptrs);
  page.markDirty();
  page.markNeedsGenerate();
  return lifted;
}

/**
 * Lifts every object of `run` that sits inside a form XObject onto the page
 * and marks the run as page-level. Scanned text is left alone; it is edited by
 * redrawing. Returns false when an object could not be moved, in which case
 * edits to it will not survive a save.
 */
export function liftRunToPage(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
): boolean {
  const byContainer = new Map<number, number[]>();
  for (const [ptr, container] of collectContainersByPtr(run)) {
    if (!ptr || !container) continue;
    const ptrs = byContainer.get(container);
    if (ptrs) ptrs.push(ptr);
    else byContainer.set(container, [ptr]);
  }
  if (byContainer.size === 0 || isScanRun(run)) return true;
  let lifted = true;
  for (const [container, ptrs] of byContainer)
    lifted = liftObjectsToPage(doc, page, container, ptrs) && lifted;
  if (!lifted) return false;
  markPageLevel(run);
  run.dirty = true;
  return true;
}

/** Lifts an image out of its form XObject; false when it could not be moved, and it is then still in the form. */
export function liftImageToPage(
  doc: EditorDocument,
  page: Page,
  image: ImageObject,
): boolean {
  if (!image.containerPtr) return true;
  if (
    !image.pdfiumObjPtr ||
    !liftObjectsToPage(doc, page, image.containerPtr, [image.pdfiumObjPtr])
  )
    return false;
  image.containerPtr = 0;
  return true;
}

function markPageLevel(run: TextRun): void {
  run.containerPtr = 0;
  run.topLevelContainerPtr = 0;
  run.paragraphMemberContainers = run.paragraphMemberContainers.map(() => 0);
  run.paragraphLeafContainers = run.paragraphLeafContainers.map(() => 0);
  if (run.paragraphLineSlots.some((slot) => slot.containerPtr))
    run.paragraphLineSlots = run.paragraphLineSlots.map((slot) => ({
      ...slot,
      containerPtr: 0,
    }));
}
