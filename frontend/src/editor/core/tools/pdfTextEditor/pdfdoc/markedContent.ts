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
  setDictEntry,
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

interface PageSlots {
  entry: NumberTreeEntry;
  /** The slots as read, joined, to tell whether the edits changed them. */
  read: string;
  slots: string[];
}

/**
 * The pages' ParentTree arrays as a save's edits leave them, shared by the
 * passes that change them so no pass writes over another's slots. An array
 * written directly in its number-tree node is spliced into that node, back to
 * front, so pages whose arrays share one node each keep their own span.
 */
export class ParentTreeWriter {
  private readonly pages = new Map<number, PageSlots | null>();

  constructor(
    private readonly pdf: RawPdf,
    private readonly treeRoot: number,
  ) {}

  /**
   * The page's slots as the edits so far leave them, for the caller to change
   * in place; null when the page has no ParentTree array.
   */
  slots(pageNum: number): string[] | null {
    if (!this.pages.has(pageNum))
      this.pages.set(pageNum, this.readPage(pageNum));
    return this.pages.get(pageNum)?.slots ?? null;
  }

  /**
   * The changed arrays, or the nodes that hold them directly. A node another
   * pass already rewrote in `bodies` is merged there instead, so the revision
   * does not carry the object twice. Null when such a node cannot be merged.
   */
  objects(bodies: Map<number, string>): RevisionObject[] | null {
    const arrays = new Map<number, string>();
    const splices = new Map<number, { span: ValueSpan; text: string }[]>();
    for (const page of this.pages.values()) {
      if (!page) continue;
      const array = `[${page.slots.join(" ")}]`;
      if (array === page.read) continue;
      const arrayNum = referencedObject(page.entry.span.text);
      if (arrayNum !== null) {
        arrays.set(arrayNum, array);
        continue;
      }
      const node = splices.get(page.entry.objNum) ?? [];
      node.push({ span: page.entry.span, text: array });
      splices.set(page.entry.objNum, node);
    }
    const out: RevisionObject[] = [];
    for (const [num, array] of arrays) {
      out.push({ num, body: plainObject(array) });
    }
    for (const [num, node] of splices) {
      let body = this.pdf.objectBody(num)!;
      for (const s of node.sort((a, b) => b.span.start - a.span.start)) {
        body = spliceValue(body, s.span, s.text);
      }
      const edited = bodies.get(num);
      if (edited === undefined) {
        out.push({ num, body: plainObject(body) });
        continue;
      }
      const merged = this.mergeInlineTree(num, body, edited);
      if (!merged) return null;
      bodies.set(num, merged);
    }
    return out;
  }

  /**
   * `edited` with the /ParentTree of `spliced`. Spans index the original body,
   * so they are applied there and the whole tree carried across. Only the
   * StructTreeRoot can be both an element's parent and an inline tree's node:
   * an indirect node is never an element.
   */
  private mergeInlineTree(
    num: number,
    spliced: string,
    edited: string,
  ): string | null {
    if (num !== this.treeRoot) return null;
    const tree = this.pdf.valueSpan(spliced, "ParentTree");
    return tree ? setDictEntry(edited, "ParentTree", tree.text) : null;
  }

  private readPage(pageNum: number): PageSlots | null {
    const page = this.pdf.objectBody(pageNum);
    const key = page ? this.pdf.dictInt(page, "StructParents") : null;
    const tree =
      key === null ? null : this.pdf.parentTreeArray(this.treeRoot, key);
    if (!tree?.items) return null;
    const slots = tree.items.map((item) => item.text);
    return { entry: tree.entry, read: `[${slots.join(" ")}]`, slots };
  }
}
