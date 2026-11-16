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

// Why text and images are lifted out of form XObjects before they are edited.
//
// PDFium does not save a change made to an object inside a form: moved,
// recoloured or resized, it shows on screen and is gone from the saved file.
// It does save an object taken out of a form, but by rewriting the form's own
// stream, and a form is shared: the same one can be drawn twice on a page and
// again on others, and each of those would lose the object too.
//
// Taking the form's instance off the page avoids both. PDFium then leaves the
// shared stream alone, so every other use still draws it whole, and what the
// instance drew goes onto this page as ordinary objects, in the same place
// and the same order, where every later change is saved.

interface FormModule {
  FPDFFormObj_CountObjects?: (form: number) => number;
  FPDFFormObj_GetObject?: (form: number, index: number) => number;
  FPDFFormObj_RemoveObject?: (form: number, obj: number) => boolean;
}

const FPDF_PAGEOBJ_FORM = 5;
// As deep as the reader walks: a run is never found in a form nested further.
const MAX_FORM_DEPTH = 4;
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function childrenOf(m: WrappedPdfiumModule, form: number): number[] {
  const mod = m as unknown as FormModule;
  const count = mod.FPDFFormObj_CountObjects?.(form) ?? 0;
  const children: number[] = [];
  for (let i = 0; i < count; i++) {
    const child = mod.FPDFFormObj_GetObject?.(form, i) ?? 0;
    if (child) children.push(child);
  }
  return children;
}

// The forms from `form` down to `wanted`, outermost first; null when `form` does not lead to it.
function chainFrom(
  m: WrappedPdfiumModule,
  form: number,
  wanted: number,
  depth: number,
): number[] | null {
  if (form === wanted) return [form];
  if (depth >= MAX_FORM_DEPTH) return null;
  for (const child of childrenOf(m, form)) {
    if (m.FPDFPageObj_GetType(child) !== FPDF_PAGEOBJ_FORM) continue;
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
  return -1;
}

// Replaces a form instance drawn by the page itself with the objects it drew.
function dissolve(page: Page, m: WrappedPdfiumModule, form: number): boolean {
  const remove = (m as unknown as FormModule).FPDFFormObj_RemoveObject;
  const matrix = readMatrix(m, form);
  const at = indexOnPage(m, page.pagePtr, form);
  if (!remove || !matrix || at < 0) return false;
  const children = childrenOf(m, form);
  // Off the page before anything leaves it: an instance still on the page has its shared stream rewritten.
  if (!m.FPDFPage_RemoveObject(page.pagePtr, form)) return false;
  const [a, b, c, d, e, f] = matrix;
  const placed: Array<{ ptr: number; index: number }> = [];
  for (const child of children) {
    if (!remove(form, child)) continue;
    // A shape deleted from this form was only hidden until the next save; it stays off the page, as its undo expects.
    if (page.pendingFormRemovals.delete(child)) continue;
    transformObject(m, child, a, b, c, d, e, f);
    m.FPDFPage_InsertObject(page.pagePtr, child);
    placed.push({ ptr: child, index: at + placed.length });
  }
  restoreContentOrder(m, page.pagePtr, placed);
  forgetForm(page, form);
  return true;
}

// Everything the model recorded as living in `form` now lives on the page.
function forgetForm(page: Page, form: number): void {
  const onPage = (container: number) => (container === form ? 0 : container);
  for (const run of page.runs) {
    run.containerPtr = onPage(run.containerPtr);
    run.topLevelContainerPtr = onPage(run.topLevelContainerPtr);
    if (run.paragraphMemberContainers.includes(form))
      run.paragraphMemberContainers = run.paragraphMemberContainers.map(onPage);
    if (run.paragraphLeafContainers.includes(form))
      run.paragraphLeafContainers = run.paragraphLeafContainers.map(onPage);
    if (run.paragraphLineSlots.some((slot) => slot.containerPtr === form))
      run.paragraphLineSlots = run.paragraphLineSlots.map((slot) => ({
        ...slot,
        containerPtr: onPage(slot.containerPtr),
      }));
  }
  for (const image of page.images)
    image.containerPtr = onPage(image.containerPtr);
  for (const shape of page.shapes) {
    if (shape.containerPtr !== form) continue;
    shape.containerPtr = 0;
    shape.topLevelContainerPtr = 0;
    shape.containerTransform = { ...IDENTITY };
  }
}

function drawsEditedScan(page: Page, forms: number[]): boolean {
  return page.runs.some(
    (run) =>
      run.scanEdit !== null &&
      [...collectContainersByPtr(run).values()].some((container) =>
        forms.includes(container),
      ),
  );
}

/**
 * Puts everything the form instance `container` draws onto the page itself,
 * in the same place and order, and takes the instance off the page. A form
 * nested in others is reached by dissolving each one around it first. Not
 * undone: the page looks the same before and after, and PDFium has no call to
 * put an object back into a form.
 *
 * Returns false, changing nothing, when the page does not draw `container`,
 * this build cannot take objects out of a form, or the form holds scanned text
 * that has been edited, whose redraw is tied to where the form drew it.
 */
export function liftFormToPage(
  doc: EditorDocument,
  page: Page,
  container: number,
): boolean {
  const m = doc.module;
  const chain = chainTo(m, page.pagePtr, container);
  if (!chain || drawsEditedScan(page, chain)) return false;
  for (const form of chain) if (!dissolve(page, m, form)) return false;
  page.markDirty();
  page.markNeedsGenerate();
  return true;
}

/**
 * Lifts the forms that draw any part of `run` onto the page, leaving the run
 * page-level. Scanned text is left alone; it is edited by redrawing. Returns
 * false when a form could not be lifted, in which case edits to the run will
 * not survive a save.
 */
export function liftRunToPage(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
): boolean {
  const forms = new Set(
    [...collectContainersByPtr(run)]
      .filter(([ptr, container]) => ptr && container)
      .map(([, container]) => container),
  );
  if (forms.size === 0 || isScanRun(run)) return true;
  let lifted = true;
  for (const form of forms) {
    // An earlier form in this loop may have held this one, and lifted it with it.
    if (![...collectContainersByPtr(run).values()].includes(form)) continue;
    lifted = liftFormToPage(doc, page, form) && lifted;
  }
  if (lifted) run.dirty = true;
  return lifted;
}

/** Lifts the form that draws `image` onto the page; false when it could not be, and the image is then still in the form. */
export function liftImageToPage(
  doc: EditorDocument,
  page: Page,
  image: ImageObject,
): boolean {
  if (!image.containerPtr) return true;
  return liftFormToPage(doc, page, image.containerPtr);
}
