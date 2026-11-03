import type { StructureElement } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { StructureRole } from "@editor/tools/pdfTextEditor/model/structureTypes";
import {
  elementKids,
  ownsOnlyMarkedContent,
} from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import {
  RawPdf,
  referencedObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  StructureNodes,
  type ElementNode,
} from "@editor/tools/pdfTextEditor/pdfdoc/structureNodes";
import { decodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";

type ElementInfo = Omit<StructureElement, "mcids">;

/** One page's elements as its ParentTree array gives them. */
export interface FilePageStructure {
  elements: StructureElement[];
  /** The array's length; null when the page names an entry that cannot be read. */
  slotCount: number | null;
}

/** A block element, and where its text is drawn. */
export interface FileBlock extends StructureRole {
  /** Its StructureBlock key. */
  key: string;
  /** The first page drawing its text; null when it draws none. */
  pageIndex: number | null;
  /** Its MCIDs on that page, its inline elements' included. */
  mcids: number[];
}

export interface FileStructure {
  /**
   * Every page with /StructParents, keyed by page index, its elements each
   * listing only the MCIDs the page's ParentTree slots give it: the lookup
   * the save addresses edits by. PDFium lists an element's MCIDs from every
   * page with no page attached, so an element spanning a page break would
   * claim another element's MCID there.
   */
  pages: Map<number, FilePageStructure>;
  /** Every block element, in the tree's reading order. */
  blocks: FileBlock[];
}

/**
 * The file's structure tree. Null when the file is untagged, cannot be
 * parsed, or is encrypted, whose strings would read as ciphertext.
 */
export async function readFileStructure(
  bytes: Uint8Array,
): Promise<FileStructure | null> {
  const pdf = await RawPdf.parse(bytes);
  if (!pdf || pdf.encrypted) return null;
  const catalog = pdf.objectBody(pdf.rootNum);
  const treeRoot = catalog ? pdf.dictRef(catalog, "StructTreeRoot") : null;
  const rootBody = treeRoot === null ? null : pdf.objectBody(treeRoot);
  if (treeRoot === null || !rootBody) return null;
  const nodes = new StructureNodes(pdf, rootBody);
  const nodeFor = (num: number) => nodes.node(num);

  const infos = new Map<number, ElementInfo | null>();
  const infoFor = (num: number): ElementInfo | null => {
    if (!infos.has(num)) {
      const node = nodeFor(num);
      infos.set(num, node && readElement(pdf, num, node));
    }
    return infos.get(num)!;
  };

  const byPage = new Map<number, FilePageStructure>();
  pdf.pageNumbers().forEach((pageNum, pageIndex) => {
    const page = pdf.objectBody(pageNum);
    const key = page ? pdf.dictInt(page, "StructParents") : null;
    if (key === null) return;
    const items = pdf.parentTreeArray(treeRoot, key)?.items;
    if (!items) {
      byPage.set(pageIndex, { elements: [], slotCount: null });
      return;
    }
    const owned = new Map<number, StructureElement>();
    items.forEach((item, mcid) => {
      const num = referencedObject(item.text);
      const info = num === null ? null : infoFor(num);
      if (num === null || !info) return;
      const element = owned.get(num) ?? { ...info, mcids: [] };
      element.mcids.push(mcid);
      owned.set(num, element);
    });
    byPage.set(pageIndex, {
      elements: [...owned.values()],
      slotCount: items.length,
    });
  });
  return {
    pages: byPage,
    blocks: readBlocks(pdf, rootBody, nodeFor, byPage),
  };
}

/** Block elements in the depth-first /K order a reader follows. */
function readBlocks(
  pdf: RawPdf,
  rootBody: string,
  nodeFor: (num: number) => ElementNode | null,
  pages: Map<number, FilePageStructure>,
): FileBlock[] {
  const drawn = new Map<string, { pageIndex: number; mcids: number[] }>();
  for (const [pageIndex, page] of pages) {
    for (const el of page.elements) {
      const at = drawn.get(el.block.key) ?? { pageIndex, mcids: [] };
      if (at.pageIndex === pageIndex) at.mcids.push(...el.mcids);
      drawn.set(el.block.key, at);
    }
  }

  const blocks: FileBlock[] = [];
  const seen = new Set<number>();
  const visit = (body: string): void => {
    for (const kid of elementKids(pdf, body) ?? []) {
      const num = referencedObject(kid);
      if (num === null || seen.has(num)) continue;
      seen.add(num);
      const node = nodeFor(num);
      const kidBody = pdf.objectBody(num);
      if (!node || !kidBody) continue;
      const key = String(num);
      if (node.block.key === key) {
        const at = drawn.get(key);
        blocks.push({
          key,
          role: node.role,
          type: node.type,
          pageIndex: at?.pageIndex ?? null,
          mcids: at ? [...at.mcids].sort((a, b) => a - b) : [],
        });
      }
      visit(kidBody);
    }
  };
  visit(rootBody);
  return blocks;
}

function readElement(
  pdf: RawPdf,
  num: number,
  node: ElementNode,
): ElementInfo | null {
  const body = pdf.objectBody(num);
  if (!body) return null;
  const text = (key: string): string | null => {
    const value = pdf.resolve(body, key);
    return value === null ? null : decodeTextString(value.trim());
  };
  return {
    role: node.role,
    type: node.type,
    block: node.block,
    key: String(num),
    alt: text("Alt"),
    actualText: text("ActualText"),
    onlyMarkedContent: ownsOnlyMarkedContent(pdf, body),
  };
}
