import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { RetagBlocker } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { StructureRole } from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { TextRunSnapshot } from "@editor/tools/pdfTextEditor/types";

/** How a run's text is tagged. */
export type TextTag =
  /** The block the text belongs to, so a Link in a P reads as the P. */
  | { kind: "tagged"; block: StructureRole; cannotRetag: RetagBlocker | null }
  | { kind: "artifact" }
  | { kind: "untagged"; documentTagged: boolean }
  /** Drawn by a form XObject, whose marks the editor does not read. */
  | { kind: "unknown" };

export function textTag(doc: EditorDocument, run: TextRunSnapshot): TextTag {
  if (run.inForm) return { kind: "unknown" };
  if (run.artifact) return { kind: "artifact" };
  if (run.mcid === undefined) {
    return { kind: "untagged", documentTagged: doc.isTagged() };
  }
  const structure = doc.structure(run.pageIndex);
  const block = structure.block(run.mcid);
  if (!block) return { kind: "untagged", documentTagged: doc.isTagged() };
  return {
    kind: "tagged",
    block: { role: block.role, type: block.type },
    cannotRetag: structure.cannotRetag(run.mcid),
  };
}
