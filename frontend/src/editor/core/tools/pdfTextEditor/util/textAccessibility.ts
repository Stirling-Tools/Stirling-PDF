import { elementStretches } from "@editor/tools/pdfTextEditor/commands/TagTextRangeCommand";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type {
  InnerOptions,
  RetagBlocker,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { StructureRole } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { TextLanguage } from "@editor/tools/pdfTextEditor/model/languageTag";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { innermostMcid } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import type { TextRunSnapshot } from "@editor/tools/pdfTextEditor/types";
import type {
  DocumentHeading,
  HeadingText,
} from "@editor/tools/pdfTextEditor/util/headingOutline";

/** How a run's text is tagged. */
export type TextTag =
  /** The block the text belongs to, so a Link in a P reads as the P. */
  | { kind: "tagged"; block: StructureRole; cannotRetag: RetagBlocker | null }
  | { kind: "artifact" }
  /** `taggable` when TagTextCommand can give the text an element. */
  | { kind: "untagged"; documentTagged: boolean; taggable: boolean }
  /** Drawn by a form XObject, whose marks the editor does not read. */
  | { kind: "unknown" }
  /** Several runs' text, not all tagged alike; `settable` when every run's tag can be set. */
  | { kind: "mixed"; settable: boolean };

export function textTag(doc: EditorDocument, run: TextRunSnapshot): TextTag {
  if (run.inForm) return { kind: "unknown" };
  if (run.artifact) return { kind: "artifact" };
  const untagged = {
    kind: "untagged",
    documentTagged: doc.treatAsTagged(),
    taggable: canTagText(doc, run),
  } as const;
  if (run.mcid === undefined) return untagged;
  const structure = doc.structure(run.pageIndex);
  const block = structure.block(run.mcid);
  if (!block) return untagged;
  return {
    kind: "tagged",
    block: { role: block.role, type: block.type },
    cannotRetag: structure.cannotRetag(run.mcid),
  };
}

/** True when the tag picker can set the text's tag: retag it, or tag it. */
export function canSetTextTag(tag: TextTag): boolean {
  switch (tag.kind) {
    case "tagged":
      return tag.cannotRetag === null;
    case "untagged":
      return tag.taggable;
    case "mixed":
      return tag.settable;
    default:
      return false;
  }
}

/**
 * How several runs' text is tagged together: the tag they share, or mixed.
 * Shared, it is settable only when every run's is.
 */
export function sharedTextTag(tags: readonly TextTag[]): TextTag {
  const [first, ...rest] = tags;
  const settable = tags.every(canSetTextTag);
  if (!rest.every((tag) => sameTagShown(first, tag))) {
    return { kind: "mixed", settable };
  }
  switch (first.kind) {
    case "tagged":
      return settable
        ? { ...first, cannotRetag: null }
        : (tags.find((tag) => tag.kind === "tagged" && tag.cannotRetag) ??
            first);
    case "untagged":
      return { ...first, taggable: settable };
    default:
      return first;
  }
}

function sameTagShown(a: TextTag, b: TextTag): boolean {
  if (a.kind === "tagged" && b.kind === "tagged") {
    return a.block.role === b.block.role;
  }
  if (a.kind === "untagged" && b.kind === "untagged") {
    return a.documentTagged === b.documentTagged;
  }
  return a.kind === b.kind;
}

/**
 * True when the run's text can be given an element of its own: it is drawn
 * by the page itself, whose save can add one, and has no tag or artifact
 * mark.
 */
export function canTagText(doc: EditorDocument, run: TextRunSnapshot): boolean {
  return (
    !run.inForm &&
    !run.artifact &&
    run.mcid === undefined &&
    doc.structure(run.pageIndex).cannotAddElement() === null
  );
}

/** An element marking part of a run's text, rather than the run's own block. */
export interface InnerTag extends InnerOptions {
  /** As PageStructure.innerType takes it. */
  key: string;
  /** The text it marks, and where in the run's text, in code units. */
  text: string;
  start: number;
  end: number;
  role: StructureRole;
  language: TextLanguage;
  /** False when the save cannot write the page's tags. */
  languageEditable: boolean;
}

/** The run's inner tags in reading order, as the session has them. */
export function innerTags(
  doc: EditorDocument,
  run: TextRunSnapshot,
): InnerTag[] {
  if (run.inForm || run.mcid === undefined) return [];
  const structure = doc.structure(run.pageIndex);
  const block = structure.block(run.mcid);
  if (!block) return [];
  return elementStretches(doc, run.pageIndex, run.id).flatMap(
    ({ start, end, element }) => {
      if (!structure.marksPartOf(element, block.key)) return [];
      const role = structure.innerType(element.key);
      if (!role) return [];
      const options = structure.innerOptions(element.key);
      const text = run.text.slice(start, end);
      const language = doc.innerLanguage(run.pageIndex, run.mcid!, element.key);
      const languageEditable = structure.readOnly === null;
      return [
        {
          key: element.key,
          text,
          start,
          end,
          role,
          language,
          languageEditable,
          ...options,
        },
      ];
    },
  );
}

/**
 * The run and range showing a heading cut from a run's text. Runs carrying
 * `partOf` are tried first, since reading a run's marks walks its objects.
 */
export function locateHeading(
  doc: EditorDocument,
  heading: DocumentHeading,
): HeadingText | null {
  if (heading.pageIndex === null) return null;
  const pageIndex = heading.pageIndex;
  const runs = doc.page(pageIndex).runs;
  const likely = (run: TextRun) =>
    heading.partOf?.includes(innermostMcid(run.tagMarks) ?? -1) ?? false;
  const ordered = [
    ...runs.filter(likely),
    ...runs.filter((run) => !likely(run)),
  ];
  for (const run of ordered) {
    const stretch = elementStretches(doc, pageIndex, run.id).find((s) =>
      s.element.mcids.includes(heading.mcids[0]),
    );
    if (stretch) {
      return {
        runId: run.id,
        range: { start: stretch.start, end: stretch.end },
      };
    }
  }
  return null;
}
