import {
  containingBlock,
  type StructureBlock,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import {
  structureRole,
  type StructureRole,
  type StructureType,
} from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";

export interface ElementNode extends StructureRole {
  block: StructureBlock;
  /** The parent element's object number; null at the top of the tree. */
  parent: number | null;
}

/**
 * Elements that hold only their own parts, so nothing else may be placed
 * among their kids: a list holds items, a table its rows.
 */
const PARTS_ONLY: ReadonlySet<StructureType> = new Set<StructureType>([
  "L",
  "Table",
  "THead",
  "TBody",
  "TFoot",
  "TR",
  "TOC",
]);

/**
 * The role and block of each element in a file's structure tree, read from
 * the raw objects as asked for. The editor reads blocks through this and the
 * save resolves them through it, so both mean the same element by a block.
 */
export class StructureNodes {
  private readonly nodes = new Map<number, ElementNode | null>();
  private readonly roleMap: string | null;

  /**
   * `body` reads an object as the caller has it, so a pass that adds elements
   * can resolve them; by default, as the file has it. An element is read
   * once, when first asked about.
   */
  constructor(
    private readonly pdf: RawPdf,
    treeRootBody: string,
    private readonly body: (num: number) => string | null = (num) =>
      pdf.objectBody(num),
  ) {
    this.roleMap = pdf.resolve(treeRootBody, "RoleMap");
  }

  /** Null for an object that is not a structure element. */
  node(num: number): ElementNode | null {
    if (this.nodes.has(num)) return this.nodes.get(num)!;
    // Set before recursing so a /P cycle ends as the top of the tree.
    this.nodes.set(num, null);
    const body = this.body(num);
    const s = body ? this.pdf.dictName(body, "S") : null;
    if (!body || s === null) return null;
    const role = structureRole(this.applyRoleMap(s));
    const parentNum = this.pdf.dictRef(body, "P");
    const parent = parentNum === null ? null : this.node(parentNum);
    const node = {
      ...role,
      block: containingBlock({ key: String(num), ...role }, parent),
      parent: parent ? parentNum : null,
    };
    this.nodes.set(num, node);
    return node;
  }

  /** The object number of the block element `num` belongs to: `num` itself for a block. */
  blockOf(num: number): number {
    const node = this.node(num);
    return node ? Number(node.block.key) : num;
  }

  /**
   * The element new content read after (or before) element `num`'s content
   * is placed beside: its block, or the list or table holding that block,
   * since those take no other kids.
   */
  placementSibling(num: number): number {
    let sibling = this.blockOf(num);
    for (;;) {
      const parent = this.node(sibling)?.parent ?? null;
      const type = parent === null ? null : this.node(parent)?.type;
      if (parent === null || !type || !PARTS_ONLY.has(type)) return sibling;
      sibling = parent;
    }
  }

  /** Follow /RoleMap (ISO 32000-1 14.8.4) until a type it does not remap. */
  private applyRoleMap(type: string): string {
    let current = type;
    const seen = new Set<string>();
    while (this.roleMap && !seen.has(current)) {
      seen.add(current);
      const mapped = this.pdf.dictName(this.roleMap, current);
      if (mapped === null) break;
      current = mapped;
    }
    return current;
  }
}
