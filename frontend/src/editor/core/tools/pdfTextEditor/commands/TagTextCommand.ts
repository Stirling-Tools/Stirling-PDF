import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import { collectMemberPtrs } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  oneObjectPerMarkList,
  restoreObject,
  retagObject,
  type ObjectRetag,
} from "@editor/tools/pdfTextEditor/commands/retagObjects";
import {
  furnitureKind,
  type Furniture,
} from "@editor/tools/pdfTextEditor/model/artifactKind";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  ARTIFACT_TAG,
  highestMcid,
  markListKey,
  readTagMarks,
  type TagMark,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import {
  retaggableText,
  type RetaggableText,
  type TextTagChoice,
} from "@editor/tools/pdfTextEditor/util/textAccessibility";

interface Plan {
  from: RetaggableText;
  /** The element the text is given; null when it becomes an artifact. */
  element: { mcid: number; type: StructureType } | null;
  tag: TagMark;
  objects: ObjectRetag[];
  /** The run and every run sharing one of its mark lists, with their marks before. */
  runs: { id: string; marks: readonly TagMark[] }[];
  /** Images drawn on those mark lists, as they were before. */
  images: { id: string; mcid: number | null; artifact: boolean }[];
}

/**
 * Tag text as a new element of `as`, or as an artifact of its kind, where
 * retaggableText allows. Unlike a retag this changes the text's marks, so the
 * save regenerates the page's content; the save pass then gives a new element
 * its place in the tree. Every object backing the run carries the one MCID,
 * and the save's repair gives each sequence PDFium writes for them its own.
 * Text in an element the session added can only become an artifact here:
 * RetagBlockCommand changes its type. Text drawn in one marked-content sequence
 * with other runs or images shares their mark list (markListKey), so it is
 * tagged with them, as one element.
 */
export class TagTextCommand implements Command {
  readonly type = "tag-text";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly as: TextTagChoice;
  /** Chosen on first apply, so a redo reuses its MCID. */
  private plan: Plan | null = null;

  constructor(opts: { pageIndex: number; runId: string; as: TextTagChoice }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.as = opts.as;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.runs.find((r) => r.id === this.runId);
    this.plan ??= run ? planTagging(doc, run, this.as) : null;
    if (!run || !this.plan) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotRetag",
            "This text's tag can't be changed.",
          ),
        ),
      );
    }
    const { from, element, tag, objects, runs, images } = this.plan;
    const done: ObjectRetag[] = [];
    try {
      for (const object of objects) {
        retagObject(doc, object, tag);
        done.push(object);
      }
    } catch (err) {
      for (const object of done.reverse()) restoreObject(doc, object, tag.name);
      throw new RolledBackError(err);
    }
    const structure = doc.structure(this.pageIndex);
    if (from.kind === "added") structure.removeElement(from.element.mcid);
    if (element) structure.addElement(element.mcid, element.type);
    for (const { id } of runs) {
      const shared = page.runs.find((r) => r.id === id);
      if (shared) shared.tagMarks = [tag];
    }
    for (const { id } of images) {
      const image = page.findImage(id);
      if (!image) continue;
      image.artifact = tag.name === ARTIFACT_TAG;
      image.mcid = tag.mcid;
    }
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (!this.plan) return;
    const page = doc.page(this.pageIndex);
    const { from, element, tag, objects, runs, images } = this.plan;
    for (const object of [...objects].reverse()) {
      restoreObject(doc, object, tag.name);
    }
    const structure = doc.structure(this.pageIndex);
    if (element) structure.removeElement(element.mcid);
    if (from.kind === "added") structure.restoreElement(from.element);
    for (const { id, marks } of runs) {
      const shared = page.runs.find((r) => r.id === id);
      if (shared) shared.tagMarks = marks;
    }
    for (const { id, mcid, artifact } of images) {
      const image = page.findImage(id);
      if (!image) continue;
      image.mcid = mcid;
      image.artifact = artifact;
    }
    page.markDirty();
    page.markNeedsGenerate();
  }
}

/** The run's objects to retag as `as`; null when the text cannot be. */
function planTagging(
  doc: EditorDocument,
  run: TextRun,
  as: TextTagChoice,
): Plan | null {
  const snapshot = run.snapshot();
  const from = retaggableText(doc, snapshot);
  const members = collectMemberPtrs(run);
  if (!from || members.includes(0)) return null;
  // Already so, or a type change RetagBlockCommand makes.
  const unchanged =
    typeof as === "string"
      ? from.kind === "added"
      : from.kind === "artifact" &&
        as.artifact === (snapshot.furniture ?? null);
  if (unchanged) return null;
  const structure = doc.structure(run.pageIndex);
  const owned = (mcid: number) => structure.owns(mcid);
  const movableObjects = (ptrs: readonly number[]) =>
    ptrs.flatMap((ptr) => {
      const dropped = readTagMarks(doc.module, ptr);
      return movable(from, dropped, owned) ? [{ ptr, dropped }] : [];
    });
  const own = movableObjects(members);
  if (own.length === 0) return null;
  const page = doc.page(run.pageIndex);
  const sharing = sharingMarkLists(doc, page, run, own);
  const objects = oneObjectPerMarkList(doc.module, [
    ...own,
    ...movableObjects(sharing.runs.flatMap(collectMemberPtrs)),
  ]);
  const runs = [run, ...sharing.runs].map((r) => ({
    id: r.id,
    marks: r.tagMarks,
  }));
  const images = sharing.images.map((image) => ({
    id: image.id,
    mcid: image.mcid,
    artifact: image.artifact,
  }));
  if (typeof as !== "string") {
    const tag = artifactTag(as.artifact);
    return { from, element: null, tag, objects, runs, images };
  }
  const mcid = structure.freeMcid(highestMcid(doc.module, page.pagePtr));
  const element = { mcid, type: as };
  return { from, element, tag: { name: as, mcid }, objects, runs, images };
}

/**
 * The other runs, and the images, drawn on one of the mark lists `objects` carry:
 * retagging those objects retags them too.
 */
function sharingMarkLists(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  objects: readonly ObjectRetag[],
) {
  const m = doc.module;
  const keys = new Set(
    objects.flatMap(({ ptr }) => {
      const key = markListKey(m, ptr);
      return key === null ? [] : [key];
    }),
  );
  const onList = (ptr: number) => {
    if (!ptr || keys.size === 0) return false;
    const key = markListKey(m, ptr);
    return key !== null && keys.has(key);
  };
  return {
    runs: page.runs.filter(
      (other) => other !== run && collectMemberPtrs(other).some(onList),
    ),
    images: page.images.filter(
      (image) => image.containerPtr === 0 && onList(image.pdfiumObjPtr),
    ),
  };
}

function artifactTag(furniture: Furniture | null): TagMark {
  const tag = { name: ARTIFACT_TAG, mcid: null };
  return furniture ? { ...tag, artifact: furnitureKind(furniture) } : tag;
}

/**
 * True when an object of text tagged `from`, carrying `marks`, takes the new
 * tag: one with no marks, or only the ones the text is moving from, which for
 * untagged text are MCIDs no element owns. An artifact beside untagged text,
 * such as a bullet, stays one.
 */
function movable(
  from: RetaggableText,
  marks: readonly TagMark[],
  owned: (mcid: number) => boolean,
): boolean {
  return marks.every((mark) => {
    if (mark.name === ARTIFACT_TAG) return from.kind === "artifact";
    if (from.kind === "added") return mark.mcid === from.element.mcid;
    return from.kind === "untagged" && mark.mcid !== null && !owned(mark.mcid);
  });
}
