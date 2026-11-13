import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import { collectMemberPtrs } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
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
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  ARTIFACT_TAG,
  highestMcid,
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
  runMarks: readonly TagMark[];
}

/**
 * Tag text as a new element of `as`, or as an artifact of its kind, where
 * retaggableText allows. Unlike a retag this changes the text's marks, so the
 * save regenerates the page's content; the save pass then gives a new element
 * its place in the tree. Every object backing the run carries the one MCID,
 * and the save's repair gives each sequence PDFium writes for them its own.
 * Text in an element the session added can only become an artifact here:
 * RetagTextCommand changes its type.
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
    const { from, element, tag, objects } = this.plan;
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
    run.tagMarks = [tag];
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (!this.plan) return;
    const page = doc.page(this.pageIndex);
    const { from, element, tag, objects, runMarks } = this.plan;
    for (const object of [...objects].reverse()) {
      restoreObject(doc, object, tag.name);
    }
    const structure = doc.structure(this.pageIndex);
    if (element) structure.removeElement(element.mcid);
    if (from.kind === "added") structure.restoreElement(from.element);
    const run = page.runs.find((r) => r.id === this.runId);
    if (run) run.tagMarks = runMarks;
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
  // Already so, or a type change RetagTextCommand makes.
  const unchanged =
    typeof as === "string"
      ? from.kind === "added"
      : from.kind === "artifact" &&
        as.artifact === (snapshot.furniture ?? null);
  if (unchanged) return null;
  const objects = members.flatMap((ptr) => {
    const dropped = readTagMarks(doc.module, ptr);
    return movable(from, dropped) ? [{ ptr, dropped }] : [];
  });
  if (objects.length === 0) return null;
  const runMarks = run.tagMarks;
  if (typeof as !== "string") {
    const tag = artifactTag(as.artifact);
    return { from, element: null, tag, objects, runMarks };
  }
  const mcid = doc
    .structure(run.pageIndex)
    .freeMcid(highestMcid(doc.module, doc.page(run.pageIndex).pagePtr));
  const element = { mcid, type: as };
  return { from, element, tag: { name: as, mcid }, objects, runMarks };
}

function artifactTag(furniture: Furniture | null): TagMark {
  const tag = { name: ARTIFACT_TAG, mcid: null };
  return furniture ? { ...tag, artifact: furnitureKind(furniture) } : tag;
}

/**
 * True when an object of text tagged `from`, carrying `marks`, takes the new
 * tag: one with no marks, or only the ones the text is moving from. An
 * artifact beside untagged text, such as a bullet, stays one.
 */
function movable(from: RetaggableText, marks: readonly TagMark[]): boolean {
  return marks.every((mark) =>
    mark.name === ARTIFACT_TAG
      ? from.kind === "artifact"
      : from.kind === "added" && mark.mcid === from.element.mcid,
  );
}
