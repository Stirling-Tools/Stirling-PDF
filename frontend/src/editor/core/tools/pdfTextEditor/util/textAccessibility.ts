import { elementStretches } from "@editor/tools/pdfTextEditor/commands/TagTextRangeCommand";
import type { Furniture } from "@editor/tools/pdfTextEditor/model/artifactKind";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type {
  AddedElement,
  InnerOptions,
  RetagBlocker,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import type {
  StructureRole,
  StructureType,
} from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { TextLanguage } from "@editor/tools/pdfTextEditor/model/languageTag";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { innermostMcid } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import type { TextRunSnapshot } from "@editor/tools/pdfTextEditor/types";
import type {
  DocumentHeading,
  HeadingText,
} from "@editor/tools/pdfTextEditor/util/headingOutline";

/** An artifact, which screen readers skip: page furniture, or plain decoration with null. */
export interface ArtifactChoice {
  artifact: Furniture | null;
}

/** What text can be tagged as: a type, or an artifact. */
export type TextTagChoice = StructureType | ArtifactChoice;

/** How a run's text is tagged. */
export type TextTag =
  /** The block the text belongs to, so a Link in a P reads as the P. */
  | {
      kind: "tagged";
      block: StructureRole;
      cannotRetag: RetagBlocker | null;
      canBeArtifact: boolean;
    }
  /**
   * `furniture` null for plain decoration, or an artifact whose kind is not
   * read. `taggable` when the text can be given a type again, or another kind.
   */
  | { kind: "artifact"; furniture: Furniture | null; taggable: boolean }
  /** `taggable` when TagTextCommand can give the text an element, or make it an artifact. */
  | { kind: "untagged"; documentTagged: boolean; taggable: boolean }
  /** Drawn by a form XObject, whose marks the editor does not read. */
  | { kind: "unknown" }
  /** Several runs' text, not all tagged alike; each flag holds when it does for every run. */
  | { kind: "mixed"; settable: boolean; canBeArtifact: boolean };

export function textTag(doc: EditorDocument, run: TextRunSnapshot): TextTag {
  if (run.inForm) return { kind: "unknown" };
  const retaggable = retaggableText(doc, run) !== null;
  if (run.artifact) {
    return {
      kind: "artifact",
      furniture: run.furniture ?? null,
      taggable: retaggable,
    };
  }
  const untagged = {
    kind: "untagged",
    documentTagged: doc.treatAsTagged(),
    taggable: retaggable,
  } as const;
  if (run.mcid === undefined) return untagged;
  const structure = doc.structure(run.pageIndex);
  const block = structure.block(run.mcid);
  if (!block) return untagged;
  if (structure.decorative(run.mcid)) {
    return {
      kind: "artifact",
      furniture: structure.furniture(run.mcid),
      taggable: true,
    };
  }
  return {
    kind: "tagged",
    block: { role: block.role, type: block.type },
    cannotRetag: structure.cannotRetag(run.mcid),
    canBeArtifact:
      retaggable || structure.cannotMarkDecorative(run.mcid) === null,
  };
}

/** True when the tag picker can give the text a type: retag it, or tag it. */
export function canTypeText(tag: TextTag): boolean {
  switch (tag.kind) {
    case "tagged":
      return tag.cannotRetag === null;
    case "artifact":
    case "untagged":
      return tag.taggable;
    case "mixed":
      return tag.settable;
    default:
      return false;
  }
}

/** True when the tag picker can make the text an artifact, or another kind of one. */
export function canBeArtifact(tag: TextTag): boolean {
  switch (tag.kind) {
    case "artifact":
      return tag.taggable;
    case "tagged":
    case "mixed":
      return tag.canBeArtifact;
    case "untagged":
      return tag.taggable;
    default:
      return false;
  }
}

/** True when the tag picker can change the text's tag at all. */
export function canSetTextTag(tag: TextTag): boolean {
  return canTypeText(tag) || canBeArtifact(tag);
}

/**
 * How several runs' text is tagged together: the tag they share, or mixed.
 * Shared, it can change only as every run's can.
 */
export function sharedTextTag(tags: readonly TextTag[]): TextTag {
  const [first, ...rest] = tags;
  const settable = tags.every(canTypeText);
  const artifactable = tags.every(canBeArtifact);
  if (!rest.every((tag) => sameTagShown(first, tag))) {
    return { kind: "mixed", settable, canBeArtifact: artifactable };
  }
  switch (first.kind) {
    case "tagged": {
      const blocked = tags.find(
        (tag) => tag.kind === "tagged" && tag.cannotRetag !== null,
      );
      return {
        ...first,
        cannotRetag:
          blocked?.kind === "tagged" ? blocked.cannotRetag : first.cannotRetag,
        canBeArtifact: artifactable,
      };
    }
    case "artifact":
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
  if (a.kind === "artifact" && b.kind === "artifact") {
    return a.furniture === b.furniture;
  }
  return a.kind === b.kind;
}

/** How a run's text is tagged, where TagTextCommand can change it. */
export type RetaggableText =
  | { kind: "untagged" }
  | { kind: "artifact" }
  | { kind: "added"; element: AddedElement };

/**
 * The run's tag when TagTextCommand can change it: text the page itself
 * draws, whose save can add an element, that is untagged, an artifact, or in
 * an element the session added that nothing else depends on. Null
 * otherwise, for text the file's elements own among the rest.
 */
export function retaggableText(
  doc: EditorDocument,
  run: TextRunSnapshot,
): RetaggableText | null {
  if (run.inForm) return null;
  const structure = doc.structure(run.pageIndex);
  if (structure.cannotAddElement() !== null) return null;
  if (run.mcid === undefined) {
    return run.artifact ? { kind: "artifact" } : { kind: "untagged" };
  }
  const element = structure.standaloneAdded(run.mcid);
  return element ? { kind: "added", element } : null;
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
  /** The link annotations it holds, and their description; null when it holds none. */
  link: InnerTagLink | null;
}

export interface InnerTagLink {
  annotations: number[];
  /** The first annotation's /Contents, as the session has it. */
  description: string | null;
  /** False when the save cannot write the page's tags. */
  editable: boolean;
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
      const editable = structure.readOnly === null;
      const annotations = structure.linksHeldBy(element.key);
      const link =
        annotations.length > 0
          ? {
              annotations,
              description: structure.linkContents(annotations[0]),
              editable,
            }
          : null;
      return [
        {
          key: element.key,
          text,
          start,
          end,
          role,
          language,
          languageEditable: editable,
          link,
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
