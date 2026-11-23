import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import { parseOps } from "@editor/tools/pdfTextEditor/pdfdoc/contentOps";
import {
  dictKeys,
  RawPdf,
  referencedObject,
  setDictEntry,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
  type RevisionObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";

/** Opacities of a page object, 0-255 as PDFium reports them. */
export interface ObjectOpacity {
  fill: number;
  stroke: number;
}

/**
 * The opacities of the objects page `pageIndex` draws with the transform
 * `matrix` [a b c d e f]; empty when none matches.
 */
export type OpacityAt = (
  pageIndex: number,
  matrix: number[],
) => ObjectOpacity[];

/**
 * Define every graphics state a regenerated page uses with `gs` but does not
 * declare, from the opacities of the objects drawn with it.
 *
 * PDFium names the graphics state an object's opacity needs once per page and
 * then reuses the name, but only the first object to use it holds it; once
 * that object is gone the regenerated page drops the definition while later
 * objects still name it, and every reader then draws them opaque. Each object
 * PDFium writes sets its own transform with `cm` right after `gs`, which
 * finds the objects a name was written for.
 *
 * Returns `bytes` when nothing is missing or the file cannot be read; a name
 * whose objects disagree on their opacity, or cannot be found, is defined as
 * a state that changes nothing, which is how every reader draws it already.
 */
export async function defineMissingGraphicsStates(
  bytes: Uint8Array,
  pages: number[],
  opacityAt: OpacityAt,
): Promise<Uint8Array> {
  const pdf = await RawPdf.parse(bytes);
  if (!pdf || pdf.encrypted) return bytes;
  const edited = new Map<number, string>();
  const added: RevisionObject[] = [];
  let next = pdf.highestObjectNumber + 1;
  const bodyOf = (num: number) => edited.get(num) ?? pdf.objectBody(num);

  for (const pageIndex of [...new Set(pages)].sort((a, b) => a - b)) {
    const pageNum = pdf.pageNumberAt(pageIndex);
    if (pageNum === null) continue;
    const content = await pdf.pageContent(pageNum);
    if (!content) continue;
    const resources = pdf.pageInherited(pageNum, "Resources") ?? "<< >>";
    const states = pdf.resolve(resources, "ExtGState");
    const declared = new Set(states ? (dictKeys(states) ?? []) : []);
    const missing = matricesByMissingName(toLatin1(content), declared);
    if (missing.size === 0) continue;

    const entries: Array<[string, string]> = [];
    for (const [name, matrices] of missing) {
      const num = next++;
      added.push({
        num,
        body: plainObject(stateFor(pageIndex, matrices, opacityAt)),
      });
      entries.push([name, `${num} 0 R`]);
    }
    const pageBody = bodyOf(pageNum);
    if (!pageBody) continue;
    const written = addStates(pdf, bodyOf, edited, pageNum, pageBody, entries);
    if (!written) return bytes;
  }
  if (added.length === 0) return bytes;
  const objects: RevisionObject[] = [
    ...added,
    ...[...edited].map(([num, body]) => ({ num, body: plainObject(body) })),
  ];
  return appendRevision(pdf, objects) ?? bytes;
}

function matricesByMissingName(
  content: string,
  declared: Set<string>,
): Map<string, number[][]> {
  const out = new Map<string, number[][]>();
  const ops = parseOps(content);
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.op !== "gs" || op.operands.length !== 1) continue;
    const name = op.operands[0].slice(1);
    if (declared.has(name)) continue;
    const list = out.get(name) ?? [];
    out.set(name, list);
    for (let j = i + 1; j < ops.length && ops[j].op !== "Q"; j++) {
      if (ops[j].op !== "cm") continue;
      const matrix = ops[j].operands.map(Number);
      if (matrix.length === 6 && matrix.every(Number.isFinite))
        list.push(matrix);
      break;
    }
  }
  return out;
}

function stateFor(
  pageIndex: number,
  matrices: number[][],
  opacityAt: OpacityAt,
): string {
  const found = new Map<string, ObjectOpacity>();
  for (const matrix of matrices)
    for (const opacity of opacityAt(pageIndex, matrix))
      found.set(`${opacity.fill}/${opacity.stroke}`, opacity);
  if (found.size !== 1) return "<< /Type /ExtGState >>";
  const [{ fill, stroke }] = found.values();
  return `<< /Type /ExtGState /ca ${alpha(fill)} /CA ${alpha(stroke)} >>`;
}

function alpha(value: number): string {
  return String(Math.round((value / 255) * 1e6) / 1e6);
}

// Adds `entries` to the ExtGState of the page's own /Resources, following
// whichever of the two is written by reference. False when there is no
// dictionary to add them to.
function addStates(
  pdf: RawPdf,
  bodyOf: (num: number) => string | null,
  edited: Map<number, string>,
  pageNum: number,
  pageBody: string,
  entries: Array<[string, string]>,
): boolean {
  const resources = pdf.valueSpan(pageBody, "Resources");
  if (!resources) {
    const inherited = pdf.pageInherited(pageNum, "Resources") ?? "<< >>";
    const merged = withStates(pdf, bodyOf, edited, inherited, entries);
    const page = merged && setDictEntry(pageBody, "Resources", merged);
    if (!page) return false;
    edited.set(pageNum, page);
    return true;
  }
  const holderNum = referencedObject(resources.text.trim());
  if (holderNum !== null) {
    const holder = bodyOf(holderNum);
    const merged = holder && withStates(pdf, bodyOf, edited, holder, entries);
    if (!merged) return false;
    edited.set(holderNum, merged);
    return true;
  }
  const merged = withStates(pdf, bodyOf, edited, resources.text, entries);
  const page = merged && setDictEntry(pageBody, "Resources", merged);
  if (!page) return false;
  edited.set(pageNum, page);
  return true;
}

// `resources` with `entries` added to its ExtGState. When that dictionary is
// written by reference, it is the referenced object that changes.
function withStates(
  pdf: RawPdf,
  bodyOf: (num: number) => string | null,
  edited: Map<number, string>,
  resources: string,
  entries: Array<[string, string]>,
): string | null {
  const span = pdf.valueSpan(resources, "ExtGState");
  const statesNum = span ? referencedObject(span.text.trim()) : null;
  let states = statesNum !== null ? bodyOf(statesNum) : (span?.text ?? "<< >>");
  for (const [name, ref] of entries) {
    states = states && setDictEntry(states, name, ref);
  }
  if (!states) return null;
  if (statesNum !== null) {
    edited.set(statesNum, states);
    return resources;
  }
  return setDictEntry(resources, "ExtGState", states);
}
