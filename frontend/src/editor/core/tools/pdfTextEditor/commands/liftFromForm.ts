import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import i18n from "i18next";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { ImageObject } from "@editor/tools/pdfTextEditor/model/ImageObject";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { FormNode } from "@editor/tools/pdfTextEditor/pdfdoc/formLocalResources";
import {
  collectContainersByPtr,
  pageObjectIndex,
  restoreContentOrder,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { RolledBackError } from "@editor/tools/pdfTextEditor/commands/Command";
import { isScanRun } from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { readMatrix } from "@editor/tools/pdfTextEditor/commands/textPieces";
import { markNamesOf } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import { transformObject } from "@editor/tools/pdfTextEditor/util/objectTransform";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

// PDFium never saves a change made inside a form XObject, and saves an object
// taken out of one only by rewriting the form's shared stream, so every other
// use of the form loses it too. Taking this page's instance off the page
// leaves the shared stream alone, and its contents go onto the page as
// ordinary objects, in the same place and order, where later changes save.
//
// PDFium cannot give an object a clip, so a clip that cuts what the form
// draws, an optional-content mark, and resources only the form binds would be
// lost with the instance; a lift that would lose any of them is refused.

interface FormModule {
  FPDFFormObj_CountObjects?: (form: number) => number;
  FPDFFormObj_GetObject?: (form: number, index: number) => number;
  FPDFFormObj_RemoveObject?: (form: number, obj: number) => boolean;
}

const FPDF_PAGEOBJ_FORM = 5;
// As deep as the reader walks: a run is never found in a form nested further.
const MAX_FORM_DEPTH = 4;

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

/** The forms from a page-level one down to `form`, outermost first; null when the page does not draw it. */
export function chainTo(
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

type Point = [number, number];
type Affine6 = [number, number, number, number, number, number];

const IDENTITY: Affine6 = [1, 0, 0, 1, 0, 0];
const SEGMENT_BEZIER = 1;
// Points of slack when testing that a clip encloses what the form draws.
const CLIP_SLACK_PT = 0.5;

function apply(t: Affine6, [x, y]: Point): Point {
  return [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
}

function innerThenOuter(inner: Affine6, outer: Affine6): Affine6 {
  return [
    inner[0] * outer[0] + inner[1] * outer[2],
    inner[0] * outer[1] + inner[1] * outer[3],
    inner[2] * outer[0] + inner[3] * outer[2],
    inner[2] * outer[1] + inner[3] * outer[3],
    inner[4] * outer[0] + inner[5] * outer[2] + outer[4],
    inner[4] * outer[1] + inner[5] * outer[3] + outer[5],
  ];
}

function boundsIn(
  m: WrappedPdfiumModule,
  obj: number,
  toPage: Affine6,
): [number, number, number, number] | null {
  const buf = scratchPtr(m, SCRATCH.liftBounds, 16);
  if (!m.FPDFPageObj_GetBounds(obj, buf, buf + 4, buf + 8, buf + 12))
    return null;
  const [l, b, r, t] = [0, 1, 2, 3].map((i) =>
    m.pdfium.getValue(buf + i * 4, "float"),
  );
  const corners = [
    apply(toPage, [l, b]),
    apply(toPage, [r, b]),
    apply(toPage, [r, t]),
    apply(toPage, [l, t]),
  ];
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// The polygon of one clip path in page space; null when it holds a curve.
function clipPolygon(
  m: WrappedPdfiumModule,
  clip: number,
  path: number,
  toPage: Affine6,
): Point[] | null {
  const buf = scratchPtr(m, SCRATCH.liftClipPoint, 8);
  const points: Point[] = [];
  const count = m.FPDFClipPath_CountPathSegments(clip, path);
  for (let i = 0; i < count; i++) {
    const segment = m.FPDFClipPath_GetPathSegment(clip, path, i);
    if (!segment || m.FPDFPathSegment_GetType(segment) === SEGMENT_BEZIER)
      return null;
    if (!m.FPDFPathSegment_GetPoint(segment, buf, buf + 4)) return null;
    points.push(
      apply(toPage, [
        m.pdfium.getValue(buf, "float"),
        m.pdfium.getValue(buf + 4, "float"),
      ]),
    );
  }
  const last = points[points.length - 1];
  if (
    points.length > 1 &&
    Math.abs(last[0] - points[0][0]) < 1e-3 &&
    Math.abs(last[1] - points[0][1]) < 1e-3
  )
    points.pop();
  return points.length >= 3 ? points : null;
}

// True when `inside` lies within the convex polygon, whichever way it winds.
function convexHolds(polygon: Point[], inside: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    const length = Math.hypot(bx - ax, by - ay);
    if (length < 1e-6) continue;
    for (const [px, py] of inside) {
      const side = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / length;
      if (Math.abs(side) <= CLIP_SLACK_PT) continue;
      const s = Math.sign(side);
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return isConvex(polygon);
}

function isConvex(polygon: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    const [cx, cy] = polygon[(i + 2) % polygon.length];
    const turn = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(turn) < 1e-6) continue;
    if (sign === 0) sign = Math.sign(turn);
    else if (Math.sign(turn) !== sign) return false;
  }
  return true;
}

// Whether the clip the form object is drawn through hides any of what it
// draws on the visible page. A clip by text, or by a shape this cannot test,
// counts as hiding something.
function clipHidesContent(
  m: WrappedPdfiumModule,
  page: Page,
  form: number,
  toPage: Affine6,
): boolean {
  const clip = m.FPDFPageObj_GetClipPath(form);
  if (!clip) return false;
  const paths = m.FPDFClipPath_CountPaths(clip);
  if (paths < 0) return false;
  if (paths === 0) return true;
  const drawn = boundsIn(m, form, toPage);
  if (!drawn) return true;
  const d = page.display;
  const left = Math.max(drawn[0], d.cropLeft);
  const bottom = Math.max(drawn[1], d.cropBottom);
  const right = Math.min(drawn[2], d.cropLeft + d.cropWidth);
  const top = Math.min(drawn[3], d.cropBottom + d.cropHeight);
  if (left >= right || bottom >= top) return false;
  const visible: Point[] = [
    [left, bottom],
    [right, bottom],
    [right, top],
    [left, top],
  ];
  for (let path = 0; path < paths; path++) {
    const polygon = clipPolygon(m, clip, path, toPage);
    if (!polygon || !convexHolds(polygon, visible)) return true;
  }
  return false;
}

function formChildren(m: WrappedPdfiumModule, form: number): number[] {
  return childrenOf(m, form).filter(
    (child) => m.FPDFPageObj_GetType(child) === FPDF_PAGEOBJ_FORM,
  );
}

// The file's form behind each form object in `forms`, matched in drawing
// order; empty when the counts differ, so no object can be matched wrongly.
function matchNodes(
  forms: number[],
  nodes: FormNode[],
): Array<[number, FormNode]> {
  return forms.length === nodes.length
    ? forms.map((form, i) => [form, nodes[i]])
    : [];
}

/**
 * Match the page's form objects to the file's form XObjects they draw, so a
 * lift can tell which forms bind resources of their own. Must run as the page
 * is first read, while its form objects are still in the file's order:
 * PdfiumTextReader.populate calls it.
 */
export function claimFormNodes(doc: EditorDocument, page: Page): void {
  if (page.formNodes) return;
  page.formNodes = new Map();
  const hazards = doc.formHazardsOn(page.index);
  if (!Array.isArray(hazards)) return;
  const m = doc.module;
  const forms: number[] = [];
  const count = m.FPDFPage_CountObjects(page.pagePtr);
  for (let i = 0; i < count; i++) {
    const obj = m.FPDFPage_GetObject(page.pagePtr, i);
    if (obj && m.FPDFPageObj_GetType(obj) === FPDF_PAGEOBJ_FORM)
      forms.push(obj);
  }
  for (const [form, node] of matchNodes(forms, hazards))
    page.formNodes.set(form, node);
}

// The file's forms behind `chain`, outermost first; null where one is unknown.
function chainNodes(
  m: WrappedPdfiumModule,
  page: Page,
  chain: number[],
): Array<FormNode | null> {
  const nodes: Array<FormNode | null> = [page.formNodes?.get(chain[0]) ?? null];
  for (let i = 1; i < chain.length; i++) {
    const parent = nodes[i - 1];
    const match = parent
      ? matchNodes(formChildren(m, chain[i - 1]), parent.forms).find(
          ([form]) => form === chain[i],
        )
      : undefined;
    nodes.push(match ? match[1] : null);
  }
  return nodes;
}

function resourcesChangeDrawing(
  doc: EditorDocument,
  page: Page,
  chain: number[],
): boolean {
  const hazards = doc.formHazardsOn(page.index);
  if (hazards === "none") return false;
  if (hazards === "unknown") return true;
  return chainNodes(doc.module, page, chain).some(
    (node) => !node || node.changesDrawing,
  );
}

// The forms nested in `chain` that end up drawn by the page, with the file's form behind each.
function liftedNodes(
  m: WrappedPdfiumModule,
  page: Page,
  chain: number[],
): Array<[number, FormNode]> {
  const nodes = chainNodes(m, page, chain);
  return chain.flatMap((form, i) => {
    const node = nodes[i];
    if (!node) return [];
    return matchNodes(formChildren(m, form), node.forms).filter(
      ([child]) => child !== chain[i + 1],
    );
  });
}

// Whether dissolving `chain`, outermost form first, would change how the page draws.
function liftChangesDrawing(
  doc: EditorDocument,
  page: Page,
  chain: number[],
): boolean {
  if (resourcesChangeDrawing(doc, page, chain)) return true;
  const m = doc.module;
  let toPage = IDENTITY;
  for (const form of chain) {
    if (markNamesOf(m, form).includes("OC")) return true;
    if (clipHidesContent(m, page, form, toPage)) return true;
    const matrix = readMatrix(m, form);
    if (!matrix) return true;
    toPage = innerThenOuter(Array.from(matrix) as Affine6, toPage);
  }
  return false;
}

function refuseLift(): never {
  throw new RolledBackError(
    new Error(
      i18n.t(
        "pdfTextEditor.error.formLiftChangesDrawing",
        "Can't edit this: it is drawn as part of a group whose clipping or graphics settings the editor can't keep when it is changed.",
      ),
    ),
  );
}

// Replaces a form instance drawn by the page itself with the objects it drew.
function dissolve(page: Page, m: WrappedPdfiumModule, form: number): boolean {
  const remove = (m as unknown as FormModule).FPDFFormObj_RemoveObject;
  const matrix = readMatrix(m, form);
  const at = pageObjectIndex(m, page.pagePtr, form);
  if (!remove || !matrix || at < 0) return false;
  const children = childrenOf(m, form);
  // Off the page before anything leaves it: an instance still on the page has its shared stream rewritten.
  if (!m.FPDFPage_RemoveObject(page.pagePtr, form)) return false;
  const [a, b, c, d, e, f] = matrix;
  const placed: Array<{ ptr: number; index: number }> = [];
  for (const child of children) {
    if (!remove(form, child)) continue;
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
  for (const shape of page.shapes)
    shape.containerPtr = onPage(shape.containerPtr);
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
 * Throws RolledBackError, changing nothing, when lifting would change how the
 * page draws (see assertLiftable). Returns false, changing nothing, when the
 * page does not draw `container`, this build cannot take objects out of a
 * form, or the form holds scanned text that has been edited, whose redraw is
 * tied to where the form drew it.
 */
export function liftFormToPage(
  doc: EditorDocument,
  page: Page,
  container: number,
): boolean {
  const m = doc.module;
  const chain = chainTo(m, page.pagePtr, container);
  if (!chain || drawsEditedScan(page, chain)) return false;
  if (liftChangesDrawing(doc, page, chain)) refuseLift();
  const nested = liftedNodes(m, page, chain);
  for (const form of chain) if (!dissolve(page, m, form)) return false;
  for (const form of chain) page.formNodes?.delete(form);
  for (const [form, node] of nested) page.formNodes?.set(form, node);
  page.markDirty();
  page.markNeedsGenerate();
  return true;
}

function formsDrawing(run: TextRun): Set<number> {
  const forms = new Set(
    [...collectContainersByPtr(run)]
      .filter(([ptr, container]) => ptr && container)
      .map(([, container]) => container),
  );
  return forms.size === 0 || isScanRun(run) ? new Set() : forms;
}

/**
 * Throws RolledBackError when lifting any form that draws part of `runs`
 * would change how the page draws: the form is drawn through a clip that
 * hides some of it, inside optional content, or binds graphics states,
 * patterns, shadings, colour spaces or marked-content properties the page
 * binds differently. A command that lifts after changing anything calls this
 * first, so a refusal leaves the document as it was.
 */
export function assertLiftable(
  doc: EditorDocument,
  page: Page,
  runs: Iterable<TextRun>,
): void {
  for (const run of runs) {
    for (const form of formsDrawing(run)) {
      const chain = chainTo(doc.module, page.pagePtr, form);
      if (chain && liftChangesDrawing(doc, page, chain)) refuseLift();
    }
  }
}

/**
 * Lifts the forms that draw any part of `run` onto the page, leaving the run
 * page-level. Scanned text is left alone; it is edited by redrawing. Throws
 * as assertLiftable does, before lifting any. Returns false when a form could
 * not be lifted, in which case edits to the run will not survive a save.
 */
export function liftRunToPage(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
): boolean {
  const forms = formsDrawing(run);
  if (forms.size === 0) return true;
  assertLiftable(doc, page, [run]);
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
