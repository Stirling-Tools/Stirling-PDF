/**
 * Give annotations their place in the structure tree and their /Contents, as
 * an appended revision. An element holds an annotation through an OBJR kid,
 * and the annotation names it back through /StructParent and that key's
 * ParentTree entry (ISO 32000-1 14.7.4.4). PDF/UA-1 7.18 also wants the
 * annotation's /Contents, and /Tabs /S on its page.
 */
import { elementKids } from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import {
  addTreeEntries,
  firstFreeKey,
} from "@editor/tools/pdfTextEditor/pdfdoc/parentTreeEntries";
import {
  elementOwning,
  withTextEntry,
} from "@editor/tools/pdfTextEditor/pdfdoc/passes/applyStructureEdits";
import {
  RawPdf,
  arrayItems,
  indirectRef,
  referencedObject,
  setDictEntry,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
  unusedObjectNumber,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";

/** A change to one annotation on a page. */
export interface AnnotationEdit {
  pageIndex: number;
  /** The annotation's object number; the page's /Annots must reference it. */
  annotation: number;
  /**
   * Give it to the element owning this MCID on the page, as the structure
   * edits leave the tree; absent leaves it where it is.
   */
  mcid?: number;
  /** The new /Contents; null removes it, absent leaves it. */
  contents?: string | null;
}

export interface AnnotationEditFailure {
  edit: AnnotationEdit;
  reason: string;
}

/** Thrown with every edit that could not be written; none of them were. */
export class AnnotationEditError extends Error {
  constructor(readonly failures: AnnotationEditFailure[]) {
    super(
      `Could not write ${failures.length} annotation edit(s): ` +
        failures
          .map(
            (f) =>
              `page ${f.edit.pageIndex + 1} annotation ${f.edit.annotation}: ${f.reason}`,
          )
          .join("; "),
    );
    this.name = "AnnotationEditError";
  }
}

/**
 * Apply `edits` to `bytes`, all or none; later edits to the same annotation
 * win. Runs after applyStructureEdits, whose elements an edit's MCID may
 * name. Giving an annotation to the element that already holds it changes
 * nothing. Throws AnnotationEditError when any edit cannot be written.
 */
export async function applyAnnotationEdits(
  bytes: Uint8Array,
  edits: readonly AnnotationEdit[],
): Promise<Uint8Array> {
  if (edits.length === 0) return bytes;
  const fail = (reason: string) =>
    new AnnotationEditError(edits.map((edit) => ({ edit, reason })));

  const pdf = await RawPdf.parse(bytes);
  if (!pdf) throw fail("the file could not be read");
  // Strings in an encrypted file must be encrypted too, which this cannot do.
  if (pdf.encrypted) throw fail("the file is encrypted");
  const keys = edits.some((edit) => edit.mcid !== undefined)
    ? ParentKeys.open(pdf)
    : null;
  if (typeof keys === "string") throw fail(keys);

  const bodies = new Map<number, string>();
  const body = (num: number) => bodies.get(num) ?? pdf.objectBody(num);
  const holders = new Map<number, number>();
  const failures: AnnotationEditFailure[] = [];
  for (const edit of edits) {
    const pageNum = pdf.pageNumberAt(edit.pageIndex);
    const page = pageNum === null ? null : body(pageNum);
    if (pageNum === null || !page) {
      failures.push({ edit, reason: "no such page" });
      continue;
    }
    if (!pageAnnotations(pdf, page).includes(edit.annotation)) {
      failures.push({
        edit,
        reason: "the page's /Annots does not reference it",
      });
      continue;
    }
    let annotation = body(edit.annotation);
    if (!annotation || pdf.dictName(annotation, "Subtype") === null) {
      failures.push({ edit, reason: "it is not an annotation" });
      continue;
    }
    if (edit.contents !== undefined) {
      annotation = withTextEntry(annotation, "Contents", edit.contents);
    }
    if (annotation !== null && keys && edit.mcid !== undefined) {
      const element = elementOwning(pdf, keys.treeRoot, {
        pageIndex: edit.pageIndex,
        mcid: edit.mcid,
      });
      if (typeof element === "string") {
        failures.push({ edit, reason: element });
        continue;
      }
      const holder =
        holders.get(edit.annotation) ??
        holderOf(pdf, keys.treeRoot, annotation);
      if (holder !== null && holder !== element) {
        failures.push({ edit, reason: "another element holds it" });
        continue;
      }
      if (holder === null) {
        const held = withAnnotationKid(
          pdf,
          body(element) ?? "",
          edit.annotation,
          pageNum,
        );
        if (!held) {
          failures.push({ edit, reason: "its element's kids cannot be read" });
          continue;
        }
        bodies.set(element, held);
        holders.set(edit.annotation, element);
        const key = keys.add(element);
        annotation = setDictEntry(annotation, "StructParent", String(key));
        if (pdf.dictName(page, "Tabs") !== "S") {
          bodies.set(pageNum, setDictEntry(page, "Tabs", "/S") ?? page);
        }
      }
    }
    if (annotation === null) {
      failures.push({ edit, reason: "it is not a dictionary" });
      continue;
    }
    bodies.set(edit.annotation, annotation);
  }
  if (failures.length > 0) throw new AnnotationEditError(failures);
  if (keys && !keys.write(bodies)) {
    throw fail("the ParentTree cannot be extended");
  }

  const out = appendRevision(
    pdf,
    [...bodies].map(([num, written]) => ({ num, body: plainObject(written) })),
  );
  if (!out)
    throw fail("the file's cross-reference structure cannot be extended");
  return out;
}

/** The object numbers of the annotations the page's /Annots references. */
function pageAnnotations(pdf: RawPdf, page: string): number[] {
  const annots = pdf.resolve(page, "Annots")?.trim();
  const items = annots ? arrayItems(annots) : null;
  return (items ?? [])
    .map((item) => referencedObject(item.text))
    .filter((num) => num !== null);
}

/** The element the annotation's /StructParent entry names; null when it has none. */
function holderOf(
  pdf: RawPdf,
  treeRoot: number,
  annotation: string,
): number | null {
  const key = pdf.dictInt(annotation, "StructParent");
  const entry =
    key === null ? null : pdf.numberTreeEntry(treeRoot, "ParentTree", key);
  return entry ? referencedObject(entry.span.text) : null;
}

/**
 * The element's body with an OBJR for the annotation last among its /K, or
 * as it is when one is already there. Null when its /K cannot be read.
 */
function withAnnotationKid(
  pdf: RawPdf,
  element: string,
  annotation: number,
  pageNum: number,
): string | null {
  const kids = elementKids(pdf, element);
  if (!kids) return null;
  if (kids.some((kid) => objrTarget(pdf, kid) === annotation)) return element;
  kids.push(
    `<< /Type /OBJR /Obj ${indirectRef(pdf, annotation)} /Pg ${indirectRef(pdf, pageNum)} >>`,
  );
  return setDictEntry(element, "K", `[${kids.join(" ")}]`);
}

/** The object an OBJR kid references; null for any other kid. */
function objrTarget(pdf: RawPdf, kid: string): number | null {
  const ref = referencedObject(kid);
  const dict = ref === null ? kid : pdf.objectBody(ref);
  if (!dict?.trimStart().startsWith("<<")) return null;
  return pdf.dictName(dict, "Type") === "OBJR"
    ? pdf.dictRef(dict, "Obj")
    : null;
}

/** The ParentTree keys a save gives annotations, from the first one free. */
class ParentKeys {
  private readonly entries: string[] = [];

  private constructor(
    private readonly pdf: RawPdf,
    readonly treeRoot: number,
    private readonly rootBody: string,
    private next: number,
  ) {}

  /** The keys from the file's first free one, or why there are none. */
  static open(pdf: RawPdf): ParentKeys | string {
    const catalog = pdf.objectBody(pdf.rootNum);
    const treeRoot = catalog ? pdf.dictRef(catalog, "StructTreeRoot") : null;
    const rootBody = treeRoot === null ? null : pdf.objectBody(treeRoot);
    if (treeRoot === null || !rootBody) return "the file has no structure tree";
    const next = firstFreeKey(pdf, rootBody);
    if (next === null) return "the ParentTree cannot be read";
    return new ParentKeys(pdf, treeRoot, rootBody, next);
  }

  /** A new key, whose ParentTree entry names `element`. */
  add(element: number): number {
    const key = this.next++;
    this.entries.push(`${key} ${indirectRef(this.pdf, element)}`);
    return key;
  }

  /** Write the new entries to `bodies`; false when the tree cannot take them. */
  write(bodies: Map<number, string>): boolean {
    if (this.entries.length === 0) return true;
    const allocate = (written: string): number => {
      const num = unusedObjectNumber(this.pdf, bodies);
      bodies.set(num, written);
      return num;
    };
    const extended = addTreeEntries(
      this.pdf,
      this.rootBody,
      this.entries,
      bodies,
      allocate,
    );
    const root = extended
      ? setDictEntry(extended, "ParentTreeNextKey", String(this.next))
      : null;
    if (!root) return false;
    bodies.set(this.treeRoot, root);
    return true;
  }
}
