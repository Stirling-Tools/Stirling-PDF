/**
 * Repair the structure tree after PDFium regenerates a tagged page.
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
  RawPdf,
  arrayItems,
  referencedObject,
  setDictEntry,
  spliceValue,
  type NumberTreeEntry,
  type ValueSpan,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
  streamObject,
  type RevisionObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";

const REF = /^(\d+)\s+\d+\s+R$/;

interface McidSite {
  stream: number;
  mcid: number;
  /** Where the MCID's number is in the stream's text; null when a named property list holds it. */
  number: { start: number; end: number } | null;
}

interface PageSites {
  refs: number[];
  texts: string[];
  sites: McidSite[];
}

/** Changes to one element's /K for one page. */
interface KidChanges {
  pageNum: number;
  removed: Set<number>;
  /** New MCIDs to place after an existing one, in content order. */
  added: Map<number, number[]>;
}

interface PageRepair {
  streams: Map<number, string>;
  /** Where the page's ParentTree array lives, and its replacement. */
  parentEntry: NumberTreeEntry;
  parentArray: string;
  elements: Map<number, KidChanges>;
}

/**
 * Repair the tags on `pages` (page indices) of `bytes`. Null when nothing
 * needed repair or the file is not one this can extend.
 */
export async function repairStructure(
  bytes: Uint8Array,
  opts: { pages: number[]; original: Uint8Array },
): Promise<Uint8Array | null> {
  const pdf = await RawPdf.parse(bytes);
  if (!pdf || pdf.encrypted) return null;
  const catalog = pdf.objectBody(pdf.rootNum);
  const treeRoot = catalog ? pdf.dictRef(catalog, "StructTreeRoot") : null;
  if (treeRoot === null) return null;
  const before =
    opts.original.length > 0 ? await RawPdf.parse(opts.original) : null;

  const sharedStreams = streamsUsedByMoreThanOnePage(pdf);
  const objects: RevisionObject[] = [];
  const elementBodies = new Map<number, string>();
  const nodeSplices = new Map<number, { span: ValueSpan; text: string }[]>();

  for (const pageIndex of new Set(opts.pages)) {
    const pageNum = pdf.pageNumberAt(pageIndex);
    if (pageNum === null) continue;
    const beforeNum = before?.pageNumberAt(pageIndex) ?? null;
    const beforeSites =
      before && beforeNum !== null ? await pageSites(before, beforeNum) : null;
    const repair = await planPage(
      pdf,
      treeRoot,
      pageNum,
      sharedStreams,
      new Set(beforeSites?.sites.map((s) => s.mcid)),
    );
    if (!repair) continue;

    for (const [num, text] of repair.streams) {
      const raw = fromLatin1(text);
      const packed = await deflate(raw);
      objects.push({
        num,
        body: packed
          ? streamObject("<< /Filter /FlateDecode >>", packed)
          : streamObject("<< >>", raw),
      });
    }

    const entry = repair.parentEntry;
    const arrayRef = entry.span.text.match(REF);
    if (arrayRef) {
      objects.push({
        num: parseInt(arrayRef[1], 10),
        body: plainObject(repair.parentArray),
      });
    } else {
      const splices = nodeSplices.get(entry.objNum) ?? [];
      splices.push({ span: entry.span, text: repair.parentArray });
      nodeSplices.set(entry.objNum, splices);
    }

    for (const [num, changes] of repair.elements) {
      const body = elementBodies.get(num) ?? pdf.objectBody(num);
      const updated = body ? rewriteKids(pdf, body, changes) : null;
      if (updated) elementBodies.set(num, updated);
    }
  }

  for (const [num, splices] of nodeSplices) {
    // Spans index the original body, so splice back to front.
    let body = pdf.objectBody(num)!;
    for (const s of splices.sort((a, b) => b.span.start - a.span.start)) {
      body = spliceValue(body, s.span, s.text);
    }
    objects.push({ num, body: plainObject(body) });
  }
  for (const [num, body] of elementBodies) {
    objects.push({ num, body: plainObject(body) });
  }

  if (objects.length === 0) return null;
  return appendRevision(pdf, objects);
}

async function planPage(
  pdf: RawPdf,
  treeRoot: number,
  pageNum: number,
  sharedStreams: Set<number>,
  mcidsBefore: ReadonlySet<number>,
): Promise<PageRepair | null> {
  const page = pdf.objectBody(pageNum);
  const key = page ? pdf.dictInt(page, "StructParents") : null;
  if (!page || key === null) return null;
  const read = await pageSites(pdf, pageNum);
  // Renumbering a stream another page also draws would corrupt that page.
  if (!read || read.refs.some((r) => sharedStreams.has(r))) return null;
  const { refs, texts, sites } = read;

  const tree = pdf.parentTreeArray(treeRoot, key);
  if (!tree?.items) return null;
  const entry = tree.entry;
  const slots = tree.items.map((item) => item.text);
  const owner = (mcid: number): number | null =>
    referencedObject(slots[mcid] ?? "");

  const elements = new Map<number, KidChanges>();
  const changesFor = (num: number): KidChanges => {
    const found = elements.get(num);
    if (found) return found;
    const created = { pageNum, removed: new Set<number>(), added: new Map() };
    elements.set(num, created);
    return created;
  };

  const present = new Set(sites.map((s) => s.mcid));
  let next = Math.max(slots.length - 1, ...present) + 1;
  // A named occurrence keeps its MCID: renumbering it means editing a property
  // list that other BDCs may name too, so the inline repeats move instead.
  const seen = new Set(sites.filter((s) => !s.number).map((s) => s.mcid));
  const renumbered: { site: McidSite; mcid: number }[] = [];
  for (const site of sites) {
    if (!site.number) continue;
    if (!seen.has(site.mcid)) {
      seen.add(site.mcid);
      continue;
    }
    const num = owner(site.mcid);
    // An orphan's repeats have no element to join, so renumbering them
    // would only make more orphans.
    if (num === null) continue;
    const mcid = next++;
    renumbered.push({ site, mcid });
    present.add(mcid);
    while (slots.length < mcid) slots.push("null");
    slots[mcid] = `${num} 0 R`;
    const added = changesFor(num).added;
    added.set(site.mcid, [...(added.get(site.mcid) ?? []), mcid]);
  }

  for (let mcid = 0; mcid < slots.length; mcid++) {
    const num = owner(mcid);
    if (num === null || present.has(mcid) || !mcidsBefore.has(mcid)) continue;
    slots[mcid] = "null";
    changesFor(num).removed.add(mcid);
  }

  if (elements.size === 0) return null;

  const streams = new Map<number, string>();
  texts.forEach((text, stream) => {
    const here = renumbered
      .filter((r) => r.site.stream === stream)
      .map((r) => ({ at: r.site.number!, mcid: r.mcid }))
      .sort((a, b) => b.at.start - a.at.start);
    if (here.length === 0) return;
    let out = text;
    for (const { at, mcid } of here) {
      out = out.slice(0, at.start) + String(mcid) + out.slice(at.end);
    }
    streams.set(refs[stream], out);
  });

  return {
    streams,
    parentEntry: entry,
    parentArray: `[${slots.join(" ")}]`,
    elements,
  };
}

/** The page's content streams and every MCID they carry, or null when a stream cannot be read. */
async function pageSites(
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
    const properties = op.operands[1];
    if (properties?.startsWith("/")) {
      const mcid = namedMcid(properties.slice(1));
      if (mcid !== null) sites.push({ stream, mcid, number: null });
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

/**
 * Apply `changes` to an element's /K. An integer kid names an MCID on the
 * element's own /Pg, so a new MCID on another page is written as an MCR.
 */
function rewriteKids(
  pdf: RawPdf,
  body: string,
  changes: KidChanges,
): string | null {
  const span = pdf.valueSpan(body, "K");
  const kids = !span
    ? []
    : span.text.startsWith("[")
      ? (arrayItems(span.text)?.map((k) => k.text) ?? null)
      : [span.text];
  if (!kids) return null;
  const elementPage = pdf.dictRef(body, "Pg");

  const mcidOnPage = (kid: string): number | null => {
    if (/^\d+$/.test(kid)) {
      return elementPage === changes.pageNum ? parseInt(kid, 10) : null;
    }
    const ref = kid.match(REF);
    const dict = ref ? pdf.objectBody(parseInt(ref[1], 10)) : kid;
    if (!dict?.trimStart().startsWith("<<")) return null;
    if (pdf.dictName(dict, "Type") !== "MCR" || pdf.valueSpan(dict, "Stm")) {
      return null;
    }
    const page = pdf.dictRef(dict, "Pg") ?? elementPage;
    return page === changes.pageNum ? pdf.dictInt(dict, "MCID") : null;
  };
  const newKid = (mcid: number): string =>
    elementPage === changes.pageNum
      ? String(mcid)
      : `<< /Type /MCR /Pg ${changes.pageNum} 0 R /MCID ${mcid} >>`;

  const out: string[] = [];
  const placed = new Set<number>();
  for (const kid of kids) {
    const mcid = mcidOnPage(kid);
    if (mcid !== null && changes.removed.has(mcid)) continue;
    out.push(kid);
    const added = mcid === null ? undefined : changes.added.get(mcid);
    if (added && !placed.has(mcid!)) {
      out.push(...added.map(newKid));
      placed.add(mcid!);
    }
  }
  for (const [after, mcids] of changes.added) {
    if (!placed.has(after)) out.push(...mcids.map(newKid));
  }
  return setDictEntry(body, "K", `[${out.join(" ")}]`);
}

function streamsUsedByMoreThanOnePage(pdf: RawPdf): Set<number> {
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
