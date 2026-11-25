import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import { parseOps } from "@editor/tools/pdfTextEditor/pdfdoc/contentOps";
import { dictKeys, type RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";

// Names PDFium writes back by name when it moves an object out of a form: they
// keep meaning the same only when the page binds each to the same object.
const NAMED_ON_THE_PAGE = ["ExtGState", "Properties"];
// What PDFium cannot redraw from the page: a pattern is laid out in the form's
// space, and a colour space other than RGB or grey is dropped.
const NEVER_CARRIED = ["Pattern", "Shading", "ColorSpace"];
const MAX_FORM_DEPTH = 8;

/** One form XObject drawn by a page or by another form, as the file draws it. */
export interface FormNode {
  /**
   * Whether the form's contents would draw differently on the page itself:
   * its own resources bind a graphics state or marked-content property under
   * a name the page binds to something else or not at all, set a soft mask,
   * or need a pattern, shading or colour space.
   */
  changesDrawing: boolean;
  /** The forms its content draws, in drawing order. */
  forms: FormNode[];
}

/**
 * For each page drawing a form whose contents would draw differently on the
 * page itself, every form its content draws, in drawing order. A page that is
 * absent draws none.
 */
export async function formLiftHazards(
  pdf: RawPdf,
): Promise<Map<number, FormNode[]>> {
  const out = new Map<number, FormNode[]>();
  const pages = pdf.pageNumbers();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const resources = pdf.pageInherited(pages[pageIndex], "Resources");
    if (!resources || !drawsLocalForm(pdf, resources, resources, new Set(), 0))
      continue;
    const content = await pdf.pageContent(pages[pageIndex]);
    out.set(
      pageIndex,
      content ? await formsDrawn(pdf, resources, resources, content, 0) : [],
    );
  }
  return out;
}

async function formsDrawn(
  pdf: RawPdf,
  pageResources: string,
  resources: string,
  content: Uint8Array,
  depth: number,
): Promise<FormNode[]> {
  const xobjects = pdf.resolve(resources, "XObject");
  if (!xobjects || depth >= MAX_FORM_DEPTH) return [];
  const nodes: FormNode[] = [];
  for (const op of parseOps(toLatin1(content))) {
    if (op.op !== "Do" || op.operands.length !== 1) continue;
    const num = pdf.dictRef(xobjects, op.operands[0].slice(1));
    if (num === null) continue;
    const body = pdf.objectBody(num);
    if (!body || pdf.dictName(body, "Subtype") !== "Form") continue;
    const own = pdf.resolve(body, "Resources") ?? pageResources;
    const inner = await pdf.streamData(num);
    nodes.push({
      changesDrawing: bindsLocally(pdf, pageResources, own),
      forms: inner
        ? await formsDrawn(pdf, pageResources, own, inner, depth + 1)
        : [],
    });
  }
  return nodes;
}

function drawsLocalForm(
  pdf: RawPdf,
  pageResources: string,
  resources: string,
  seen: Set<number>,
  depth: number,
): boolean {
  if (depth >= MAX_FORM_DEPTH) return false;
  const xobjects = pdf.resolve(resources, "XObject");
  if (!xobjects) return false;
  for (const name of dictKeys(xobjects) ?? []) {
    const num = pdf.dictRef(xobjects, name);
    if (num === null || seen.has(num)) continue;
    seen.add(num);
    const body = pdf.objectBody(num);
    if (!body || pdf.dictName(body, "Subtype") !== "Form") continue;
    const own = pdf.resolve(body, "Resources");
    if (!own) continue;
    if (bindsLocally(pdf, pageResources, own)) return true;
    if (drawsLocalForm(pdf, pageResources, own, seen, depth + 1)) return true;
  }
  return false;
}

function bindsLocally(
  pdf: RawPdf,
  pageResources: string,
  formResources: string,
): boolean {
  if (formResources === pageResources) return false;
  for (const category of NEVER_CARRIED) {
    const entries = pdf.resolve(formResources, category);
    if (entries && (dictKeys(entries) ?? [""]).length > 0) return true;
  }
  for (const category of NAMED_ON_THE_PAGE) {
    const local = pdf.resolve(formResources, category);
    if (!local) continue;
    const onPage = pdf.resolve(pageResources, category);
    const names = dictKeys(local);
    if (names === null) return true;
    for (const name of names) {
      const value = pdf.valueSpan(local, name)?.text ?? "";
      const pageValue = onPage ? pdf.valueSpan(onPage, name)?.text : undefined;
      if (pageValue === undefined || !sameValue(value, pageValue)) return true;
      if (category === "ExtGState" && setsSoftMask(pdf, local, name))
        return true;
    }
  }
  return false;
}

function sameValue(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
}

// A soft mask is placed by the transform in force where `gs` runs, which is
// the form's inside the form and the page's once its contents are lifted.
function setsSoftMask(pdf: RawPdf, states: string, name: string): boolean {
  const state = pdf.resolve(states, name);
  if (!state) return false;
  const mask = pdf.valueSpan(state, "SMask")?.text.trim();
  return mask !== undefined && mask !== "/None";
}
