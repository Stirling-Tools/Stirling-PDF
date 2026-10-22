import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { DescriptionBlocker } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { ImageObjectSnapshot } from "@editor/tools/pdfTextEditor/types";

/** What can be said and done about one image's accessibility. */
export type ImageAccessibility =
  | { kind: "decorative" }
  | { kind: "blocked"; blocker: DescriptionBlocker; documentTagged: boolean }
  | {
      kind: "describable";
      pageIndex: number;
      mcid: number;
      description: string | null;
    };

export function imageAccessibility(
  doc: EditorDocument,
  image: ImageObjectSnapshot,
): ImageAccessibility {
  if (image.artifact) return { kind: "decorative" };
  if (image.mcid === undefined) return blocked(doc, "untagged");
  const structure = doc.structure(image.pageIndex);
  const blocker = structure.cannotDescribe(image.mcid);
  if (blocker) return blocked(doc, blocker);
  return {
    kind: "describable",
    pageIndex: image.pageIndex,
    mcid: image.mcid,
    description: structure.alt(image.mcid),
  };
}

function blocked(
  doc: EditorDocument,
  blocker: DescriptionBlocker,
): ImageAccessibility {
  return { kind: "blocked", blocker, documentTagged: doc.isTagged() };
}
