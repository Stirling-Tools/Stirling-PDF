/**
 * Repair the structure tree after PDFium regenerates a tagged page.
 */
import {
  ParentTreeWriter,
  contentStreamObject,
  elementKids,
  pageSites,
  streamsUsedByMoreThanOnePage,
  type McidSite,
} from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import {
  RawPdf,
  referencedObject,
  setDictEntry,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
  type RevisionObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";

const REF = /^(\d+)\s+\d+\s+R$/;

/** Changes to one element's /K for one page. */
interface KidChanges {
  pageNum: number;
  removed: Set<number>;
  /** New MCIDs to place after an existing one, in content order. */
  added: Map<number, number[]>;
}

interface PageRepair {
  streams: Map<number, string>;
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
  const parentTree = new ParentTreeWriter(pdf, treeRoot);

  for (const pageIndex of new Set(opts.pages)) {
    const pageNum = pdf.pageNumberAt(pageIndex);
    if (pageNum === null) continue;
    const beforeNum = before?.pageNumberAt(pageIndex) ?? null;
    const beforeSites =
      before && beforeNum !== null ? await pageSites(before, beforeNum) : null;
    const repair = await planPage(
      pdf,
      parentTree,
      pageNum,
      sharedStreams,
      new Set(beforeSites?.sites.map((s) => s.mcid)),
    );
    if (!repair) continue;

    for (const [num, text] of repair.streams) {
      objects.push(await contentStreamObject(num, text));
    }

    for (const [num, changes] of repair.elements) {
      const body = elementBodies.get(num) ?? pdf.objectBody(num);
      const updated = body ? rewriteKids(pdf, body, changes) : null;
      if (updated) elementBodies.set(num, updated);
    }
  }

  const parentTreeObjects = parentTree.objects(elementBodies);
  if (!parentTreeObjects) return null;
  objects.push(...parentTreeObjects);
  for (const [num, body] of elementBodies) {
    objects.push({ num, body: plainObject(body) });
  }

  if (objects.length === 0) return null;
  return appendRevision(pdf, objects);
}

/** Plan the page's repair, writing its ParentTree slots to `parentTree`. */
async function planPage(
  pdf: RawPdf,
  parentTree: ParentTreeWriter,
  pageNum: number,
  sharedStreams: Set<number>,
  mcidsBefore: ReadonlySet<number>,
): Promise<PageRepair | null> {
  const slots = parentTree.slots(pageNum);
  if (!slots) return null;
  const read = await pageSites(pdf, pageNum);
  // Renumbering a stream another page also draws would corrupt that page.
  if (!read || read.refs.some((r) => sharedStreams.has(r))) return null;
  const { refs, texts, sites } = read;

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

  return { streams, elements };
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
  const kids = elementKids(pdf, body);
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
