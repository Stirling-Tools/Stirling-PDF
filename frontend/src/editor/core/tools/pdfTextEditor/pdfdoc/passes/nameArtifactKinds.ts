import {
  parseOps,
  tokenize,
} from "@editor/tools/pdfTextEditor/pdfdoc/contentOps";
import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import { contentStreamObject } from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  type RevisionObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";

const KIND_KEYS = new Set(["/Type", "/Subtype"]);
/** A string the editor could have written as a kind, and so can be a name as it is. */
const NAMEABLE = /^\(([A-Za-z0-9]+)\)$/;

/**
 * Write the artifact kinds on `pageIndices` that PDFium wrote as strings as
 * the names ISO 32000-2 14.8.2.2.2 requires, as an appended revision. PDFium
 * can set a mark's parameter only as a string, so a page it regenerates
 * carries `/Artifact <</Type (Pagination)>> BDC`. A stream that cannot be
 * read is left alone: PDFium writes every stream it generates readably. The
 * bytes come back as they are when there is nothing to rewrite, or the file
 * is encrypted, where no edit can give an artifact a kind. Throws when the
 * file cannot be read or extended.
 */
export async function nameArtifactKinds(
  bytes: Uint8Array,
  pageIndices: readonly number[],
): Promise<Uint8Array> {
  if (pageIndices.length === 0) return bytes;
  const pdf = await RawPdf.parse(bytes);
  if (!pdf) throw new Error("The file could not be read");
  if (pdf.encrypted) return bytes;
  const refs = new Set(
    pageIndices.flatMap((pageIndex) => {
      const pageNum = pdf.pageNumberAt(pageIndex);
      const page = pageNum === null ? null : pdf.objectBody(pageNum);
      return page ? pdf.contentRefs(page) : [];
    }),
  );
  const rewritten: Promise<RevisionObject>[] = [];
  for (const ref of refs) {
    const data = await pdf.streamData(ref);
    if (!data) continue;
    const text = toLatin1(data);
    const named = withNamedKinds(text);
    if (named !== text) rewritten.push(contentStreamObject(ref, named));
  }
  if (rewritten.length === 0) return bytes;
  const out = appendRevision(pdf, await Promise.all(rewritten));
  if (!out) throw new Error("The file cannot be extended");
  return out;
}

/** `text` with each artifact property list's string /Type and /Subtype written as names. */
function withNamedKinds(text: string): string {
  if (!text.includes("/Artifact")) return text;
  const names: { start: number; end: number; name: string }[] = [];
  for (const op of parseOps(text)) {
    if (op.op !== "BDC" || op.operands[0] !== "/Artifact") continue;
    const tokens = tokenize(text.slice(op.start, op.end));
    let depth = 0;
    tokens.forEach((token, i) => {
      if (token.text === "<<") depth += 1;
      else if (token.text === ">>") depth -= 1;
      const value = tokens[i + 1];
      const string = value?.text.match(NAMEABLE);
      if (depth !== 1 || !KIND_KEYS.has(token.text) || !string) return;
      names.push({
        start: op.start + value.start,
        end: op.start + value.end,
        name: `/${string[1]}`,
      });
    });
  }
  let out = text;
  for (const { start, end, name } of names.reverse()) {
    out = out.slice(0, start) + name + out.slice(end);
  }
  return out;
}
