import type {
  LinkAnnotation,
  PageArea,
} from "@editor/tools/pdfTextEditor/model/LinkAnnotation";
import {
  arrayItems,
  referencedObject,
  type RawPdf,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { decodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";

/** Bounds a pathological page; PdfiumAnnotationReader stops at the same count. */
const MAX_ANNOTS = 2000;

/**
 * The link annotations of each page, by page index, that the save can give an
 * element: those the page's /Annots references, as an OBJR's /Obj must
 * (ISO 32000-1 14.7.4.3). `treeRoot` resolves the element each is given to;
 * null for a file with no structure tree. Pages with none are left out.
 */
export function readLinks(
  pdf: RawPdf,
  treeRoot: number | null,
): Map<number, LinkAnnotation[]> {
  return annotationsByPage(pdf, (num) => readLink(pdf, num, treeRoot));
}

/**
 * What `read` makes of each annotation a page's /Annots references, by page
 * index; null leaves one out. Pages with none are left out.
 */
export function annotationsByPage<T>(
  pdf: RawPdf,
  read: (num: number) => T | null,
): Map<number, T[]> {
  const out = new Map<number, T[]>();
  pdf.pageNumbers().forEach((pageNum, pageIndex) => {
    const page = pdf.objectBody(pageNum);
    const annots = page ? pdf.resolve(page, "Annots")?.trim() : null;
    const refs = (annots ? arrayItems(annots) : null) ?? [];
    const found = refs.slice(0, MAX_ANNOTS).flatMap((ref) => {
      const num = referencedObject(ref.text);
      const annotation = num === null ? null : read(num);
      return annotation ? [annotation] : [];
    });
    if (found.length > 0) out.set(pageIndex, found);
  });
  return out;
}

function readLink(
  pdf: RawPdf,
  num: number,
  treeRoot: number | null,
): LinkAnnotation | null {
  const body = pdf.objectBody(num);
  if (!body || pdf.dictName(body, "Subtype") !== "Link") return null;
  const quads = numbers(pdf.resolve(body, "QuadPoints"));
  const rect = numbers(pdf.resolve(body, "Rect"));
  const fromQuads = quadAreas(quads ?? []);
  const areas = fromQuads.length > 0 ? fromQuads : quadAreas(rectQuad(rect));
  if (areas.length === 0) return null;
  const contents = pdf.resolve(body, "Contents");
  return {
    annotation: num,
    areas,
    contents: contents === null ? null : decodeTextString(contents.trim()),
    holder: holderKey(pdf, body, treeRoot),
  };
}

/** A /Rect as the one quadrilateral /QuadPoints would give it. */
function rectQuad(rect: number[] | null): number[] {
  if (rect?.length !== 4) return [];
  const [x1, y1, x2, y2] = rect;
  return [x1, y1, x2, y1, x1, y2, x2, y2];
}

/**
 * The box around each quadrilateral: its points' order varies between
 * producers, and a box is enough to find the text under it.
 */
function quadAreas(values: readonly number[]): PageArea[] {
  const areas: PageArea[] = [];
  for (let i = 0; i + 8 <= values.length; i += 8) {
    const xs = [values[i], values[i + 2], values[i + 4], values[i + 6]];
    const ys = [values[i + 1], values[i + 3], values[i + 5], values[i + 7]];
    const area = {
      left: Math.min(...xs),
      bottom: Math.min(...ys),
      right: Math.max(...xs),
      top: Math.max(...ys),
    };
    if (area.right > area.left && area.top > area.bottom) areas.push(area);
  }
  return areas;
}

/** An array of numbers; null when the value is not one. */
export function numbers(value: string | null): number[] | null {
  const items = value ? arrayItems(value.trim()) : null;
  const read = items?.map((item) => Number(item.text));
  return read?.every(Number.isFinite) ? read : null;
}

/** The key of the element the annotation's /StructParent names; null when none. */
export function holderKey(
  pdf: RawPdf,
  body: string,
  treeRoot: number | null,
): string | null {
  const key = pdf.dictInt(body, "StructParent");
  if (treeRoot === null || key === null) return null;
  const entry = pdf.numberTreeEntry(treeRoot, "ParentTree", key);
  const holder = entry ? referencedObject(entry.span.text) : null;
  return holder === null ? null : String(holder);
}
