import i18n from "i18next";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import {
  collectContainersByPtr,
  collectMemberPtrs,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  furnitureKind,
  type Furniture,
} from "@editor/tools/pdfTextEditor/model/artifactKind";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { PageStructure } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import {
  ARTIFACT_TAG,
  highestMcid,
  innermostMcid,
  readTagMarks,
  type TagMark,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import {
  restoreObject,
  retagObject,
  type ObjectRetag,
} from "@editor/tools/pdfTextEditor/commands/retagObjects";

const FPDF_PAGEOBJ_PATH = 2;
const FPDF_PAGEOBJ_SHADING = 4;
const TEXT_TAG: StructureType = "P";
const IMAGE_TAG: StructureType = "Figure";

type Step =
  | {
      kind: "text";
      runId: string;
      mcid: number;
      objects: ObjectRetag[];
      runMarks: readonly TagMark[];
    }
  | {
      kind: "furniture";
      runId: string;
      tag: TagMark;
      objects: ObjectRetag[];
      runMarks: readonly TagMark[];
    }
  | { kind: "image"; imageId: string; mcid: number; object: ObjectRetag }
  | { kind: "artifact"; object: ObjectRetag };

interface Plan {
  steps: Step[];
  /** Each new element's predecessor in content order, by its MCID. */
  follows: Map<number, number | null>;
}

/**
 * Tag the untagged content drawn directly by a page, as a starting point the
 * user then corrects: each text block a P, or an artifact when `furniture`
 * names it (by run id) as page furniture, each image a Figure, every other
 * object an artifact, the new elements read in content order. Content already
 * tagged or marked an artifact is left alone. Content marked with an MCID no
 * element owns counts as untagged, losing that mark. Content in a form
 * XObject is left alone: the editor cannot tag inside one. The page must
 * already be read.
 */
export class TagPageContentCommand implements Command {
  readonly type = "tag-page-content";
  readonly pageIndex: number;
  private readonly furniture: ReadonlyMap<string, Furniture>;
  /** Chosen on first apply, so a redo reuses its MCIDs. */
  private plan: Plan | null = null;

  constructor(opts: {
    pageIndex: number;
    furniture?: ReadonlyMap<string, Furniture>;
  }) {
    this.pageIndex = opts.pageIndex;
    this.furniture = opts.furniture ?? new Map();
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const structure = doc.structure(this.pageIndex);
    if (!page.loaded || structure.cannotAddElement() !== null) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotTagPage",
            "This page's content can't be tagged.",
          ),
        ),
      );
    }
    this.plan ??= planTagging(doc, page, structure, this.furniture);
    const done: Step[] = [];
    try {
      for (const step of this.plan.steps) {
        applyStep(doc, page, structure, step, this.plan.follows);
        done.push(step);
      }
    } catch (err) {
      for (const step of done.reverse()) revertStep(doc, page, structure, step);
      throw new RolledBackError(err);
    }
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (!this.plan) return;
    const page = doc.page(this.pageIndex);
    const structure = doc.structure(this.pageIndex);
    for (const step of [...this.plan.steps].reverse()) {
      revertStep(doc, page, structure, step);
    }
    page.markDirty();
    page.markNeedsGenerate();
  }

  describe(): string {
    return i18n.t("pdfTextEditor.commands.tagPageContent", "Auto-tag page");
  }
}

/** True when TagPageContentCommand would change anything on the page, which must already be read. */
export function hasUntaggedContent(
  doc: EditorDocument,
  pageIndex: number,
): boolean {
  const structure = doc.structure(pageIndex);
  if (structure.cannotAddElement() !== null) return false;
  return (
    planTagging(doc, doc.page(pageIndex), structure, new Map()).steps.length > 0
  );
}

/** The untagged content as steps, and where each new element reads. */
function planTagging(
  doc: EditorDocument,
  page: Page,
  structure: PageStructure,
  furniture: ReadonlyMap<string, Furniture>,
): Plan {
  const m = doc.module;
  const marks = new Map<number, TagMark[]>();
  const marksOf = (ptr: number): TagMark[] => {
    if (!marks.has(ptr)) marks.set(ptr, readTagMarks(m, ptr));
    return marks.get(ptr)!;
  };
  /** The marks the object loses when tagged; null when it is not untagged. */
  const untagged = (ptr: number): TagMark[] | null => {
    const tags = marksOf(ptr);
    if (tags.some((tag) => tag.name === ARTIFACT_TAG)) return null;
    const mcid = innermostMcid(tags);
    return mcid === null || !structure.element(mcid) ? tags : null;
  };

  const order = contentOrder(m, page.pagePtr);
  let nextMcid = structure.freeMcid(highestMcid(m, page.pagePtr));
  const located: { at: number; step: Step }[] = [];

  for (const run of page.runs) {
    const containers = collectContainersByPtr(run);
    const members = collectMemberPtrs(run);
    if (
      members.length === 0 ||
      members.some((ptr) => ptr === 0 || containers.get(ptr))
    ) {
      continue;
    }
    // A run with a tagged member is part of an element already; an artifact
    // member beside untagged text, such as a bullet, stays one.
    if (members.some((ptr) => !untagged(ptr) && !isArtifact(marksOf(ptr)))) {
      continue;
    }
    const objects = members.flatMap((ptr) => {
      const dropped = untagged(ptr);
      return dropped ? [{ ptr, dropped }] : [];
    });
    if (objects.length === 0) continue;
    const at = Math.min(
      ...objects.map(({ ptr }) => order.get(ptr) ?? Infinity),
    );
    const runMarks = run.tagMarks;
    const kind = furniture.get(run.id);
    located.push({
      at,
      step: kind
        ? {
            kind: "furniture",
            runId: run.id,
            tag: {
              name: ARTIFACT_TAG,
              mcid: null,
              artifact: furnitureKind(kind),
            },
            objects,
            runMarks,
          }
        : { kind: "text", runId: run.id, mcid: nextMcid++, objects, runMarks },
    });
  }

  for (const image of page.images) {
    const dropped =
      image.containerPtr === 0 ? untagged(image.pdfiumObjPtr) : null;
    if (!dropped) continue;
    located.push({
      at: order.get(image.pdfiumObjPtr) ?? Infinity,
      step: {
        kind: "image",
        imageId: image.id,
        mcid: nextMcid++,
        object: { ptr: image.pdfiumObjPtr, dropped },
      },
    });
  }

  for (const [ptr, at] of order) {
    const type = m.FPDFPageObj_GetType(ptr);
    if (type !== FPDF_PAGEOBJ_PATH && type !== FPDF_PAGEOBJ_SHADING) continue;
    const dropped = untagged(ptr);
    if (dropped) {
      located.push({
        at,
        step: { kind: "artifact", object: { ptr, dropped } },
      });
    }
  }

  located.sort((a, b) => a.at - b.at);
  return {
    steps: located.map(({ step }) => step),
    follows: readingChain(located, order, (ptr) => {
      const mcid = innermostMcid(marksOf(ptr));
      return mcid !== null && structure.element(mcid) ? mcid : null;
    }),
  };
}

/**
 * Each new element's predecessor in content order: the content read last
 * before it, the file's or another new element's.
 */
function readingChain(
  located: readonly { at: number; step: Step }[],
  order: ReadonlyMap<number, number>,
  ownedMcid: (ptr: number) => number | null,
): Map<number, number | null> {
  const tagged: { at: number; mcid: number }[] = [];
  for (const [ptr, at] of order) {
    const mcid = ownedMcid(ptr);
    if (mcid !== null) tagged.push({ at, mcid });
  }
  for (const { at, step } of located) {
    if (step.kind === "text" || step.kind === "image") {
      tagged.push({ at, mcid: step.mcid });
    }
  }
  tagged.sort((a, b) => a.at - b.at);

  const follows = new Map<number, number | null>();
  let previous: number | null = null;
  const added = new Set(
    located.flatMap(({ step }) =>
      step.kind === "text" || step.kind === "image" ? [step.mcid] : [],
    ),
  );
  for (const { mcid } of tagged) {
    if (added.has(mcid)) follows.set(mcid, previous);
    previous = mcid;
  }
  return follows;
}

/** Each page-level object's index in the page's content, by pointer. */
function contentOrder(
  m: WrappedPdfiumModule,
  pagePtr: number,
): Map<number, number> {
  const order = new Map<number, number>();
  const count = m.FPDFPage_CountObjects(pagePtr);
  for (let i = 0; i < count; i++) {
    const ptr = m.FPDFPage_GetObject(pagePtr, i);
    if (ptr) order.set(ptr, i);
  }
  return order;
}

function isArtifact(tags: readonly TagMark[]): boolean {
  return tags.some((tag) => tag.name === ARTIFACT_TAG);
}

function applyStep(
  doc: EditorDocument,
  page: Page,
  structure: PageStructure,
  step: Step,
  follows: ReadonlyMap<number, number | null>,
): void {
  switch (step.kind) {
    case "text": {
      const run = page.runs.find((r) => r.id === step.runId);
      if (!run) throw new Error(`no run ${step.runId}`);
      const tag = { name: TEXT_TAG, mcid: step.mcid };
      for (const object of step.objects) retagObject(doc, object, tag);
      run.tagMarks = [tag];
      structure.addElement(step.mcid, TEXT_TAG, follows.get(step.mcid));
      return;
    }
    case "furniture": {
      const run = page.runs.find((r) => r.id === step.runId);
      if (!run) throw new Error(`no run ${step.runId}`);
      for (const object of step.objects) retagObject(doc, object, step.tag);
      run.tagMarks = [step.tag];
      return;
    }
    case "image": {
      const image = page.findImage(step.imageId);
      if (!image) throw new Error(`no image ${step.imageId}`);
      retagObject(doc, step.object, { name: IMAGE_TAG, mcid: step.mcid });
      image.mcid = step.mcid;
      structure.addElement(step.mcid, IMAGE_TAG, follows.get(step.mcid));
      return;
    }
    case "artifact":
      retagObject(doc, step.object, { name: ARTIFACT_TAG, mcid: null });
  }
}

/** Undo applyStep. Best effort: a step half applied is undone as far as it went. */
function revertStep(
  doc: EditorDocument,
  page: Page,
  structure: PageStructure,
  step: Step,
): void {
  switch (step.kind) {
    case "text": {
      for (const object of step.objects) restoreObject(doc, object, TEXT_TAG);
      const run = page.runs.find((r) => r.id === step.runId);
      if (run) run.tagMarks = step.runMarks;
      structure.removeElement(step.mcid);
      return;
    }
    case "furniture": {
      for (const object of step.objects) {
        restoreObject(doc, object, ARTIFACT_TAG);
      }
      const run = page.runs.find((r) => r.id === step.runId);
      if (run) run.tagMarks = step.runMarks;
      return;
    }
    case "image": {
      restoreObject(doc, step.object, IMAGE_TAG);
      const image = page.findImage(step.imageId);
      if (image) image.mcid = innermostMcid(step.object.dropped);
      structure.removeElement(step.mcid);
      return;
    }
    case "artifact":
      restoreObject(doc, step.object, ARTIFACT_TAG);
  }
}
