import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { RetagBlocker } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { StructureRole } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { TextRunSnapshot } from "@editor/tools/pdfTextEditor/types";

/** How a run's text is tagged. */
export type TextTag =
  /** The block the text belongs to, so a Link in a P reads as the P. */
  | { kind: "tagged"; block: StructureRole; cannotRetag: RetagBlocker | null }
  | { kind: "artifact" }
  /** `taggable` when TagTextCommand can give the text an element. */
  | { kind: "untagged"; documentTagged: boolean; taggable: boolean }
  /** Drawn by a form XObject, whose marks the editor does not read. */
  | { kind: "unknown" };

export function textTag(doc: EditorDocument, run: TextRunSnapshot): TextTag {
  if (run.inForm) return { kind: "unknown" };
  if (run.artifact) return { kind: "artifact" };
  const untagged = {
    kind: "untagged",
    documentTagged: doc.isTagged(),
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

/**
 * True when the run's text can be given an element of its own: it is drawn
 * by the page itself in a tagged document whose save can add one, and has no
 * tag or artifact mark.
 */
export function canTagText(doc: EditorDocument, run: TextRunSnapshot): boolean {
  return (
    doc.isTagged() &&
    !run.inForm &&
    !run.artifact &&
    run.mcid === undefined &&
    doc.structure(run.pageIndex).cannotAddElement() === null
  );
}
