/**
 * Reading and rewriting a page's marked content and its ParentTree entry, for
 * the passes that keep the structure tree and the content in step.
 */
import {
  deflate,
  fromLatin1,
  toLatin1,
} from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import {
  parseOps,
  tokenize,
} from "@editor/tools/pdfTextEditor/pdfdoc/contentOps";
import {
  arrayItems,
  referencedObject,
  spliceValue,
  type NumberTreeEntry,
  type RawPdf,
  type ValueSpan,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  plainObject,
  streamObject,
  type RevisionObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";

interface Span {
  start: number;
  end: number;
}

/** One `BDC` that carries an MCID. Spans index the text of stream `stream`. */
export interface McidSite {
  stream: number;
  mcid: number;
  /** The whole operator, operands included. */
  operator: Span;
  /** The MCID's number; null when a named property list holds it. */
  number: Span | null;
}

export interface PageSites {
  /** The page's content stream objects, in /Contents order. */
  refs: number[];
  /** Each stream's decoded text, parallel to `refs`. */
  texts: string[];
  sites: McidSite[];
}

/** The page's content streams and every MCID they carry, or null when a stream cannot be read. */
export async function pageSites(
  pdf: RawPdf,
  pageNum: number,
): Promise<PageSites | null> {
  const page = pdf.objectBody(pageNum);
  const refs = page ? pdf.contentRefs(page) : [];
  if (refs.length === 0) return null;
  const texts: string[] = [];
  for (const ref of refs) {
    const data = await pdf.streamData(ref);
    if (!data) return null;
    texts.push(toLatin1(data));
  }
  const resources = pdf.pageInherited(pageNum, "Resources");
  const properties = resources ? pdf.resolve(resources, "Properties") : null;
  const namedMcid = (name: string): number | null => {
    const list = properties ? pdf.resolve(properties, name) : null;
    return list ? pdf.dictInt(list, "MCID") : null;
  };
  return {
    refs,
    texts,
    sites: texts.flatMap((text, stream) => mcidSites(text, stream, namedMcid)),
  };
}

/**
 * Every `BDC` carrying an MCID, in content order: inline (`/P <</MCID 0>> BDC`)
 * or through a named property list (`/P /MC0 BDC`), which PDFium keeps in that
 * form when it regenerates a page.
 */
function mcidSites(
  text: string,
  stream: number,
  namedMcid: (name: string) => number | null,
): McidSite[] {
  const sites: McidSite[] = [];
  for (const op of parseOps(text)) {
    if (op.op !== "BDC") continue;
    const operator = { start: op.start, end: op.end };
    const properties = op.operands[1];
    if (properties?.startsWith("/")) {
      const mcid = namedMcid(properties.slice(1));
      if (mcid !== null) sites.push({ stream, mcid, operator, number: null });
      continue;
    }
    const tokens = tokenize(text.slice(op.start, op.end));
    let depth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i].text;
      if (t === "<<") depth += 1;
      else if (t === ">>") depth -= 1;
      else if (
        depth === 1 &&
        t === "/MCID" &&
        /^\d+$/.test(tokens[i + 1]?.text ?? "")
      ) {
        const number = tokens[i + 1];
        sites.push({
          stream,
          mcid: parseInt(number.text, 10),
          operator,
          number: {
            start: op.start + number.start,
            end: op.start + number.end,
          },
        });
        break;
      }
    }
  }
  return sites;
}

/** The value texts of an element's /K: none when it has no /K, null when /K cannot be read. */
export function elementKids(pdf: RawPdf, body: string): string[] | null {
  const span = pdf.valueSpan(body, "K");
  if (!span) return [];
  if (!span.text.startsWith("[")) return [span.text];
  return arrayItems(span.text)?.map((kid) => kid.text) ?? null;
}

/** True when every kid in the element's /K is an MCID or an MCR on a page, rather than a child element, an annotation or form XObject content. */
export function ownsOnlyMarkedContent(pdf: RawPdf, body: string): boolean {
  const kids = elementKids(pdf, body);
  if (!kids || kids.length === 0) return false;
  return kids.every((kid) => {
    if (/^\d+$/.test(kid)) return true;
    const ref = referencedObject(kid);
    const dict = ref === null ? kid : pdf.objectBody(ref);
    if (!dict?.trimStart().startsWith("<<")) return false;
    return pdf.dictName(dict, "Type") === "MCR" && !pdf.valueSpan(dict, "Stm");
  });
}

/** Content streams more than one page draws; rewriting one would change every page that draws it. */
export function streamsUsedByMoreThanOnePage(pdf: RawPdf): Set<number> {
  const seen = new Set<number>();
  const shared = new Set<number>();
  for (const pageNum of pdf.pageNumbers()) {
    const body = pdf.objectBody(pageNum);
    for (const ref of body ? new Set(pdf.contentRefs(body)) : []) {
      if (seen.has(ref)) shared.add(ref);
      seen.add(ref);
    }
  }
  return shared;
}

/** Content stream object `num` holding `text`, compressed when the platform can. */
export async function contentStreamObject(
  num: number,
  text: string,
): Promise<RevisionObject> {
  const raw = fromLatin1(text);
  const packed = await deflate(raw);
  return {
    num,
    body: packed
      ? streamObject("<< /Filter /FlateDecode >>", packed)
      : streamObject("<< >>", raw),
  };
}

/**
 * Collects replacements for pages' ParentTree arrays. An array written
 * directly in its number-tree node is spliced into that node, back to front,
 * so pages whose arrays share one node each keep their own span.
 */
export class ParentTreeWriter {
  private readonly arrays = new Map<number, string>();
  private readonly splices = new Map<
    number,
    { span: ValueSpan; text: string }[]
  >();

  set(entry: NumberTreeEntry, array: string): void {
    const arrayNum = referencedObject(entry.span.text);
    if (arrayNum !== null) {
      this.arrays.set(arrayNum, array);
      return;
    }
    const splices = this.splices.get(entry.objNum) ?? [];
    splices.push({ span: entry.span, text: array });
    this.splices.set(entry.objNum, splices);
  }

  objects(pdf: RawPdf): RevisionObject[] {
    const out: RevisionObject[] = [];
    for (const [num, array] of this.arrays) {
      out.push({ num, body: plainObject(array) });
    }
    for (const [num, splices] of this.splices) {
      let body = pdf.objectBody(num)!;
      for (const s of splices.sort((a, b) => b.span.start - a.span.start)) {
        body = spliceValue(body, s.span, s.text);
      }
      out.push({ num, body: plainObject(body) });
    }
    return out;
  }
}
