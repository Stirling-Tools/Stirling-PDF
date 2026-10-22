/**
 * Turn whole structure elements into artifacts (ISO 32000-1 14.8.2.2): each
 * marked-content sequence an element owns is retagged `/Artifact BMC` and the
 * element leaves the tree. Only the sequences' opening operators change, so
 * nothing the page paints does.
 */
import {
  ParentTreeWriter,
  contentStreamObject,
  ownsOnlyMarkedContent,
  pageSites,
  streamsUsedByMoreThanOnePage,
  type McidSite,
} from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import {
  arrayItems,
  referencedObject,
  setDictEntry,
  type RawPdf,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import type { RevisionObject } from "@editor/tools/pdfTextEditor/pdfdoc/revision";

const ARTIFACT = "/Artifact BMC";

export interface DecorativeWrites {
  /** Rewritten content streams. */
  streams: RevisionObject[];
  /** Why an element could not be turned into an artifact, by object number. */
  failed: Map<number, string>;
}

/**
 * Plan turning `elements` (object numbers) into artifacts. Element and parent
 * bodies are read from and written to `bodies`, and ParentTree slots to
 * `parentTree`, so the caller can combine them with its other edits. Nothing
 * is written for a document with any failure: the caller must discard it all.
 */
export async function markDecorative(
  pdf: RawPdf,
  elements: ReadonlySet<number>,
  bodies: Map<number, string>,
  parentTree: ParentTreeWriter,
): Promise<DecorativeWrites> {
  const failed = new Map<number, string>();
  if (elements.size === 0) return { streams: [], failed };
  const body = (num: number) => bodies.get(num) ?? pdf.objectBody(num);
  for (const num of elements) {
    const own = body(num);
    if (!own || !ownsOnlyMarkedContent(pdf, own)) {
      failed.set(num, "its content is not all marked content on its pages");
    }
  }

  const shared = streamsUsedByMoreThanOnePage(pdf);
  const streams: Promise<RevisionObject>[] = [];
  for (const pageNum of pdf.pageNumbers()) {
    const slots = parentTree.slots(pageNum);
    if (!slots) continue;
    const owners = new Map<number, number>();
    slots.forEach((slot, mcid) => {
      const num = referencedObject(slot);
      if (num !== null && elements.has(num)) owners.set(mcid, num);
    });
    if (owners.size === 0) continue;

    const read = await pageSites(pdf, pageNum);
    if (!read || read.refs.some((ref) => shared.has(ref))) {
      const reason = read
        ? "its page draws content another page also draws"
        : "its page's content cannot be read";
      for (const num of owners.values()) failed.set(num, reason);
      continue;
    }

    // Content an element owned but the page no longer draws needs only its
    // slot emptied.
    const retag = read.sites.filter((site) => owners.has(site.mcid));
    read.texts.forEach((text, stream) => {
      const here = retag.filter((site) => site.stream === stream);
      if (here.length > 0) {
        streams.push(retaggedStream(read.refs[stream], text, here));
      }
    });
    for (const mcid of owners.keys()) slots[mcid] = "null";
  }

  for (const num of elements) {
    const parentNum = pdf.dictRef(body(num) ?? "", "P");
    const parent = parentNum === null ? null : body(parentNum);
    const detached = parent ? withoutKid(pdf, parent, num) : null;
    if (parentNum !== null && detached) bodies.set(parentNum, detached);
  }

  return { streams: await Promise.all(streams), failed };
}

/** Stream object `num` holding `text` with each site's opening operator retagged as an artifact. */
function retaggedStream(
  num: number,
  text: string,
  sites: readonly McidSite[],
): Promise<RevisionObject> {
  let out = text;
  for (const site of [...sites].sort(
    (a, b) => b.operator.start - a.operator.start,
  )) {
    out =
      out.slice(0, site.operator.start) +
      ARTIFACT +
      out.slice(site.operator.end);
  }
  return contentStreamObject(num, out);
}

/** The parent's body without `num` among its /K, or null when it is not there. */
function withoutKid(pdf: RawPdf, parent: string, num: number): string | null {
  const span = pdf.valueSpan(parent, "K");
  if (!span) return null;
  if (!span.text.startsWith("[")) {
    return referencedObject(span.text) === num
      ? setDictEntry(parent, "K", "[]")
      : null;
  }
  const kids = arrayItems(span.text);
  if (!kids?.some((kid) => referencedObject(kid.text) === num)) return null;
  const kept = kids.filter((kid) => referencedObject(kid.text) !== num);
  return setDictEntry(parent, "K", `[${kept.map((k) => k.text).join(" ")}]`);
}
