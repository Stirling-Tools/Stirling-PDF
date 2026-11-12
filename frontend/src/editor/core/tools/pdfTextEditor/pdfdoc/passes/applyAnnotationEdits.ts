/**
 * Give annotations their place in the structure tree, their /Contents and a
 * widget's field its /TU, as an appended revision. An element holds an
 * annotation through an OBJR kid, and the annotation names it back through
 * /StructParent and that key's ParentTree entry (ISO 32000-1 14.7.4.4).
 * PDF/UA-1 7.18 also wants the annotation's /Contents, a widget in a Form
 * element with its field's /TU, and /Tabs /S on its page.
 */
import { elementKids } from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import {
  addTreeEntries,
  firstFreeKey,
} from "@editor/tools/pdfTextEditor/pdfdoc/parentTreeEntries";
import {
  placement,
  withKid,
} from "@editor/tools/pdfTextEditor/pdfdoc/passes/addElements";
import {
  elementOwning,
  withTextEntry,
} from "@editor/tools/pdfTextEditor/pdfdoc/passes/applyStructureEdits";
import { ensureStructureTree } from "@editor/tools/pdfTextEditor/pdfdoc/passes/ensureStructureTree";
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
import { separateField } from "@editor/tools/pdfTextEditor/pdfdoc/readWidgets";
import { StructureNodes } from "@editor/tools/pdfTextEditor/pdfdoc/structureNodes";

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
  /**
   * Give a widget a new Form element holding only it, read after the content
   * with MCID `after` (see NewElement.after); absent leaves it where it is.
   * Forms read after the same content keep the order of their edits.
   */
  newForm?: { after: number | null };
  /** The new /Contents; null removes it, absent leaves it. */
  contents?: string | null;
  /**
   * The new /TU of a widget's field, the name a screen reader gives the
   * field; null removes it, absent leaves it.
   */
  tooltip?: string | null;
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
 * or field win. Runs after applyStructureEdits, whose elements an edit's MCID
 * may name. Giving an annotation to the element that already holds it
 * changes nothing. Throws AnnotationEditError when any edit cannot be
 * written.
 */
export async function applyAnnotationEdits(
  bytes: Uint8Array,
  edits: readonly AnnotationEdit[],
): Promise<Uint8Array> {
  if (edits.length === 0) return bytes;
  const fail = (reason: string) =>
    new AnnotationEditError(edits.map((edit) => ({ edit, reason })));

  const opened = await RawPdf.parse(bytes);
  if (!opened) throw fail("the file could not be read");
  // Strings in an encrypted file must be encrypted too, which this cannot do.
  if (opened.encrypted) throw fail("the file is encrypted");
  // A Form can be the first element in the file or on its page.
  const skeleton = ensureStructureTree(
    opened,
    edits.filter((edit) => edit.newForm).map((edit) => edit.pageIndex),
  );
  if (typeof skeleton === "string") throw fail(skeleton);
  const pdf = skeleton ? await RawPdf.parse(skeleton) : opened;
  if (!pdf) throw fail("the file could not be read");
  const keys = edits.some((edit) => edit.mcid !== undefined || edit.newForm)
    ? ParentKeys.open(pdf)
    : null;
  if (typeof keys === "string") throw fail(keys);

  const revision = new AnnotationRevision(pdf, keys);
  const failures = edits.flatMap((edit) => {
    const reason = revision.write(edit);
    return reason === null ? [] : [{ edit, reason }];
  });
  if (failures.length > 0) throw new AnnotationEditError(failures);
  if (keys && !keys.write(revision.bodies)) {
    throw fail("the ParentTree cannot be extended");
  }

  const out = appendRevision(
    pdf,
    [...revision.bodies].map(([num, written]) => ({
      num,
      body: plainObject(written),
    })),
  );
  if (!out)
    throw fail("the file's cross-reference structure cannot be extended");
  return out;
}

/** Why an edit cannot be written. */
class Refused extends Error {}

/** The objects a save rewrites, as its edits leave them. */
class AnnotationRevision {
  readonly bodies = new Map<number, string>();
  /** The element this save gives each annotation to, by annotation. */
  private readonly holders = new Map<number, number>();
  /** The Form last placed after each kid, by `parent:kid`. */
  private readonly lastPlaced = new Map<string, number>();
  private nodes: StructureNodes | null = null;

  constructor(
    private readonly pdf: RawPdf,
    private readonly keys: ParentKeys | null,
  ) {}

  /** Write `edit` to the bodies; why it cannot be written, or null. */
  write(edit: AnnotationEdit): string | null {
    try {
      this.writeEdit(edit);
      return null;
    } catch (err) {
      if (err instanceof Refused) return err.message;
      throw err;
    }
  }

  private body(num: number): string | null {
    return this.bodies.get(num) ?? this.pdf.objectBody(num);
  }

  private writeEdit(edit: AnnotationEdit): void {
    const pageNum = this.pdf.pageNumberAt(edit.pageIndex);
    const page = pageNum === null ? null : this.body(pageNum);
    if (pageNum === null || !page) throw new Refused("no such page");
    if (!pageAnnotations(this.pdf, page).includes(edit.annotation)) {
      throw new Refused("the page's /Annots does not reference it");
    }
    let annotation = this.body(edit.annotation);
    const subtype = annotation
      ? this.pdf.dictName(annotation, "Subtype")
      : null;
    if (!annotation || subtype === null) {
      throw new Refused("it is not an annotation");
    }
    const widgetOnly = edit.newForm || edit.tooltip !== undefined;
    if (widgetOnly && subtype !== "Widget") {
      throw new Refused("it is not a widget");
    }
    if (edit.newForm && edit.mcid !== undefined) {
      throw new Refused("it cannot be given two elements");
    }
    if (edit.contents !== undefined) {
      annotation = dictionary(
        withTextEntry(annotation, "Contents", edit.contents),
      );
    }
    if (edit.tooltip !== undefined) {
      annotation = this.withTooltip(annotation, edit.tooltip);
    }
    const element = this.newHolder(edit, pageNum, annotation);
    if (element !== null) {
      this.holders.set(edit.annotation, element);
      const key = this.parentKeys().add(element);
      annotation = dictionary(
        setDictEntry(annotation, "StructParent", String(key)),
      );
      if (this.pdf.dictName(page, "Tabs") !== "S") {
        this.bodies.set(pageNum, setDictEntry(page, "Tabs", "/S") ?? page);
      }
    }
    this.bodies.set(edit.annotation, annotation);
  }

  private parentKeys(): ParentKeys {
    if (!this.keys) throw new Refused("the file has no structure tree");
    return this.keys;
  }

  /**
   * The element the edit gives the annotation to, once it holds it; null when
   * the edit gives it none or the element already holds it.
   */
  private newHolder(
    edit: AnnotationEdit,
    pageNum: number,
    annotation: string,
  ): number | null {
    if (edit.newForm) {
      if (this.currentHolder(edit.annotation, annotation) !== null) {
        throw new Refused("an element already holds it");
      }
      return this.addForm(pageNum, edit.annotation, edit.newForm.after);
    }
    if (edit.mcid === undefined) return null;
    const element = elementOwning(this.pdf, this.parentKeys().treeRoot, {
      pageIndex: edit.pageIndex,
      mcid: edit.mcid,
    });
    if (typeof element === "string") throw new Refused(element);
    const current = this.currentHolder(edit.annotation, annotation);
    if (current === element) return null;
    if (current !== null) throw new Refused("another element holds it");
    const held = withAnnotationKid(
      this.pdf,
      this.body(element) ?? "",
      edit.annotation,
      pageNum,
    );
    if (!held) throw new Refused("its element's kids cannot be read");
    this.bodies.set(element, held);
    return element;
  }

  /** The element holding the annotation, as the edits so far leave it; null for none. */
  private currentHolder(num: number, annotation: string): number | null {
    return (
      this.holders.get(num) ??
      holderOf(this.pdf, this.parentKeys().treeRoot, annotation)
    );
  }

  /** A new Form element holding only the annotation, read after MCID `after` on the page. */
  private addForm(
    pageNum: number,
    annotation: number,
    after: number | null,
  ): number {
    const { treeRoot } = this.parentKeys();
    const body = (num: number) => this.body(num);
    this.nodes ??= new StructureNodes(
      this.pdf,
      this.pdf.objectBody(treeRoot) ?? "",
      body,
    );
    const anchored = placement(
      this.pdf,
      body,
      treeRoot,
      this.nodes,
      this.pageSlots(treeRoot, pageNum),
      after,
    );
    // Each Form placed after a kid goes after the last one placed there, so
    // they read in the order of their edits.
    const anchor = `${anchored.parent}:${anchored.sibling}`;
    const previous = anchored.before ? undefined : this.lastPlaced.get(anchor);
    const place =
      previous === undefined ? anchored : { ...anchored, sibling: previous };
    const num = unusedObjectNumber(this.pdf, this.bodies);
    const parent = this.body(place.parent);
    const joined = parent ? withKid(this.pdf, parent, place, num) : null;
    if (!joined) throw new Refused("its parent element cannot be read");
    this.bodies.set(place.parent, joined);
    this.bodies.set(
      num,
      `<< /Type /StructElem /S /Form /P ${indirectRef(this.pdf, place.parent)} ` +
        `/Pg ${indirectRef(this.pdf, pageNum)} /K [${objr(this.pdf, annotation, pageNum)}] >>`,
    );
    if (!anchored.before) this.lastPlaced.set(anchor, num);
    return num;
  }

  /** The page's ParentTree array as the file has it; empty when it has none. */
  private pageSlots(treeRoot: number, pageNum: number): string[] {
    const page = this.pdf.objectBody(pageNum);
    const key = page ? this.pdf.dictInt(page, "StructParents") : null;
    const array = key === null ? null : this.pdf.parentTreeArray(treeRoot, key);
    return array?.items?.map((item) => item.text) ?? [];
  }

  /** The widget's body with its field's /TU set (see separateField). */
  private withTooltip(widget: string, tooltip: string | null): string {
    const parent = separateField(this.pdf, widget);
    if (parent === null) {
      return dictionary(withTextEntry(widget, "TU", tooltip));
    }
    const field = this.body(parent);
    const written = field ? withTextEntry(field, "TU", tooltip) : null;
    if (!written) throw new Refused("its field cannot be read");
    this.bodies.set(parent, written);
    return widget;
  }
}

function dictionary(body: string | null): string {
  if (body === null) throw new Refused("it is not a dictionary");
  return body;
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

function objr(pdf: RawPdf, annotation: number, pageNum: number): string {
  return `<< /Type /OBJR /Obj ${indirectRef(pdf, annotation)} /Pg ${indirectRef(pdf, pageNum)} >>`;
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
  kids.push(objr(pdf, annotation, pageNum));
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
