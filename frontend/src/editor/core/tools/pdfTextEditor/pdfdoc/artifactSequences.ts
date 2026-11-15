import type { ArtifactKind } from "@editor/tools/pdfTextEditor/model/artifactKind";
import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import {
  PATH_PAINTING,
  TEXT_SHOWING,
  parseOps,
  type ContentOp,
} from "@editor/tools/pdfTextEditor/pdfdoc/contentOps";
import { dictKeys, type RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";

/** An artifact sequence on a page whose property list names its /Type. */
export interface ArtifactSequence {
  kind: ArtifactKind;
  /** How many entries its property list has. */
  entries: number;
}

interface OpenSequence {
  sequence: ArtifactSequence | null;
  draws: boolean;
}

/**
 * The page's artifact sequences whose /Type is a name, in the order they
 * open, leaving out those that draw nothing: one for each artifact mark
 * PDFium gives the page's own objects whose kind it cannot read
 * (PdfiumTagMarks.artifactMarkRefs). Null when the content cannot be read.
 */
export async function artifactSequences(
  pdf: RawPdf,
  pageNum: number,
): Promise<ArtifactSequence[] | null> {
  const page = pdf.objectBody(pageNum);
  if (!page) return null;
  const resources = pdf.pageInherited(pageNum, "Resources");
  const properties = resources ? pdf.resolve(resources, "Properties") : null;
  const propertyList = (op: ContentOp, text: string): string | null => {
    const named = op.operands[1];
    if (!named?.startsWith("/")) return text.slice(op.start, op.end);
    return properties ? pdf.resolve(properties, named.slice(1)) : null;
  };

  const open: OpenSequence[] = [];
  const drawn: OpenSequence[] = [];
  for (const ref of pdf.contentRefs(page)) {
    const data = await pdf.streamData(ref);
    if (!data) return null;
    const text = toLatin1(data);
    for (const op of parseOps(text)) {
      if (op.op === "BMC" || op.op === "BDC") {
        const list =
          op.op === "BDC" && op.operands[0] === "/Artifact"
            ? propertyList(op, text)
            : null;
        const sequence = list ? namedKind(pdf, list) : null;
        const entry = { sequence, draws: false };
        open.push(entry);
        if (sequence) drawn.push(entry);
      } else if (op.op === "EMC") {
        open.pop();
      } else if (draws(op)) {
        for (const entry of open) entry.draws = true;
      }
    }
  }
  return drawn.flatMap(({ sequence, draws }) =>
    sequence && draws ? [sequence] : [],
  );
}

function namedKind(pdf: RawPdf, list: string): ArtifactSequence | null {
  const type = pdf.dictName(list, "Type");
  const entries = dictKeys(list)?.length;
  if (!type || entries === undefined) return null;
  return {
    kind: { type, subtype: pdf.dictName(list, "Subtype") },
    entries,
  };
}

/**
 * True when PDFium makes a page object of the operation: showing text that
 * is not empty, painting a path, or drawing an XObject, inline image or
 * shading.
 */
function draws(op: ContentOp): boolean {
  if (TEXT_SHOWING.has(op.op)) return op.operands.some(nonEmptyString);
  if (PATH_PAINTING.has(op.op)) return op.op !== "n";
  return op.op === "Do" || op.op === "EI" || op.op === "sh";
}

function nonEmptyString(token: string): boolean {
  if (token.startsWith("<<")) return false;
  return (
    (token.startsWith("(") && token !== "()") ||
    (token.startsWith("<") && token !== "<>")
  );
}
