/**
 * Merge multi-part `/Contents` arrays into a single stream, at load time.
 *
 * A page may legally split its content across several streams, and some
 * producers do it every few kilobytes. The array is defined to be the
 * concatenation of its parts, but PDFium's content generator rewrites only
 * the parts that own a modified object - so after one edit the page holds a
 * freshly written first chunk followed by stale continuation chunks that no
 * longer make sense in that graphics state. The page then renders wrongly,
 * or not at all, once it is reloaded.
 *
 * Collapsing the array before the document is ever opened removes the whole
 * failure mode, and is invisible to everything else: one stream in, one
 * stream out, same bytes of content.
 */
import {
  concatBytes,
  deflate,
  fromLatin1,
} from "@app/tools/pdfTextEditor/v2/pdfdoc/bytes";
import { RawPdf, spliceValue } from "@app/tools/pdfTextEditor/v2/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
  streamObject,
  type RevisionObject,
} from "@app/tools/pdfTextEditor/v2/pdfdoc/revision";

export interface ConsolidateResult {
  bytes: Uint8Array;
  /** Page indices whose content streams were merged. */
  pages: number[];
}

export async function consolidateContents(
  bytes: Uint8Array,
): Promise<ConsolidateResult | null> {
  const pdf = await RawPdf.parse(bytes);
  if (!pdf) return null;
  if (pdf.encrypted) return null;

  const pageNums = pdf.pageNumbers();
  const objects: RevisionObject[] = [];
  const merged: number[] = [];
  let nextNum = pdf.highestObjectNumber + 1;

  for (let pageIndex = 0; pageIndex < pageNums.length; pageIndex += 1) {
    const pageNum = pageNums[pageIndex];
    const body = pdf.objectBody(pageNum);
    if (!body) continue;
    const refs = pdf.contentRefs(body);
    if (refs.length < 2) continue;

    const parts: Uint8Array[] = [];
    let readable = true;
    for (const ref of refs) {
      const data = await pdf.streamData(ref);
      if (!data) {
        readable = false;
        break;
      }
      parts.push(data);
      // Parts join by concatenation, but a part ending mid-token would
      // fuse with the next one's first token; a separator is always legal.
      parts.push(fromLatin1("\n"));
    }
    if (!readable) continue;

    const span = pdf.valueSpan(body, "Contents");
    if (!span) continue;

    const raw = concatBytes(parts);
    const packed = await deflate(raw);
    const streamNum = nextNum;
    nextNum += 1;
    objects.push({
      num: streamNum,
      body: packed
        ? streamObject("<< /Filter /FlateDecode >>", packed)
        : streamObject("<< >>", raw),
    });
    objects.push({
      num: pageNum,
      body: plainObject(spliceValue(body, span, `${streamNum} 0 R`)),
    });
    merged.push(pageIndex);
  }

  if (objects.length === 0) return null;
  const out = appendRevision(pdf, objects);
  return out ? { bytes: out, pages: merged } : null;
}
