import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocument,
} from "@editor/services/pdfiumService";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import {
  PageStructure,
  isInlineType,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { StructureEdit } from "@editor/tools/pdfTextEditor/pdfdoc/passes/applyStructureEdits";
import { readPageStructure } from "@editor/tools/pdfTextEditor/pdfium/PdfiumStructureReader";
import { carriedMcids } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import {
  readFileStructure,
  type FileStructure,
} from "@editor/tools/pdfTextEditor/pdfdoc/readFileStructure";
import {
  isHeadingType,
  type StructureType,
} from "@editor/tools/pdfTextEditor/model/structureTypes";
import type { DocumentHeading } from "@editor/tools/pdfTextEditor/util/headingOutline";
import {
  precedingTaggedMcid,
  taggedContentInReadingOrder,
} from "@editor/tools/pdfTextEditor/util/elementPlacement";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import { FontRef } from "@editor/tools/pdfTextEditor/model/FontRef";
import { prepareForEditing } from "@editor/tools/pdfTextEditor/pdfdoc/prepareForEditing";
import { releaseScratch } from "@editor/tools/pdfTextEditor/util/wasmScratch";

// Lifetime-managed PDFium document wrapper for the PDF text editor. - Opens a
// raw PDFium document pointer from bytes.
// Above this the save-time repairs are skipped rather than keeping a second
// full copy of the file alive for the session.
const MAX_RETAINED_BYTES = 64 * 1024 * 1024;
const EMPTY = new Uint8Array(0);

export class EditorDocument {
  readonly module: WrappedPdfiumModule;
  readonly docPtr: number;
  /** Exactly the bytes PDFium was handed: the save-time repairs re-read them. */
  /** Empty when the file was too large to keep a second copy of. */
  readonly openedBytes: Uint8Array;
  private readonly pageCache: Map<number, Page>;
  private readonly structureCache = new Map<number, PageStructure>();
  /**
   * Unsaved retags by block key, each with the content the save addresses it
   * by. Held here rather than per page: an element spanning a page break is
   * one element.
   */
  private readonly retags = new Map<
    string,
    { pageIndex: number; mcid: number; type: StructureType }
  >();
  /** The file's own structure tree; null when only PDFium's view is available. */
  private readonly fileStructure: FileStructure | null;
  private readonly ownedFonts: Map<string, FontRef>;
  private _disposed: boolean;
  // Form-fill environment. Widgets with no appearance stream are drawn ONLY by
  // this layer, so without it such fields are invisible in the editor while
  // being visible everywhere else in the app. Created lazily and left null when
  // the build lacks the entry points.
  private formEnvPtr: number | null = null;
  private formEnvTried = false;
  private readonly formLoadedPages = new Set<number>();

  private constructor(
    module: WrappedPdfiumModule,
    docPtr: number,
    openedBytes: Uint8Array,
    fileStructure: FileStructure | null,
  ) {
    this.module = module;
    this.docPtr = docPtr;
    this.openedBytes = openedBytes;
    this.fileStructure = fileStructure;
    this.pageCache = new Map();
    this.ownedFonts = new Map();
    this._disposed = false;
  }

  static async open(
    data: ArrayBuffer | Uint8Array,
    password?: string,
  ): Promise<EditorDocument> {
    const module = await getPdfiumModule();
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const prepared = await prepareForEditing(bytes);
    const docPtr = await openRawDocument(prepared, password);
    // PDFium already holds its own heap copy, so retaining these doubles the
    // footprint; past a point the gradient repair is not worth that.
    const keep = prepared.length <= MAX_RETAINED_BYTES ? prepared : EMPTY;
    const fileStructure =
      keep.length > 0 && module.FPDFCatalog_IsTagged(docPtr)
        ? await readFileStructure(keep).catch(() => null)
        : null;
    return new EditorDocument(module, docPtr, keep, fileStructure);
  }

  /** Page indices whose content stream has been regenerated this session. */
  regeneratedPages(): number[] {
    return this.loadedPages()
      .filter((p) => p.regenerated)
      .map((p) => p.index);
  }

  get pageCount(): number {
    return this.module.FPDF_GetPageCount(this.docPtr);
  }

  get disposed(): boolean {
    return this._disposed;
  }

  // Form-fill environment for this document, or null when unavailable. The
  // caller must pair it with `notifyFormPageLoaded` before drawing a page.
  formEnvironment(): number | null {
    if (this.formEnvTried) return this.formEnvPtr;
    this.formEnvTried = true;
    const m = this.module as unknown as {
      PDFiumExt_OpenFormFillInfo?: () => number;
      PDFiumExt_InitFormFillEnvironment?: (doc: number, info: number) => number;
    };
    if (!m.PDFiumExt_OpenFormFillInfo || !m.PDFiumExt_InitFormFillEnvironment) {
      return null;
    }
    try {
      const info = m.PDFiumExt_OpenFormFillInfo();
      const env = m.PDFiumExt_InitFormFillEnvironment(this.docPtr, info);
      this.formEnvPtr = env || null;
    } catch {
      this.formEnvPtr = null;
    }
    return this.formEnvPtr;
  }

  /** Tell the form layer about a page once, before its first form draw. */
  notifyFormPageLoaded(page: Page): void {
    const env = this.formEnvironment();
    if (!env || this.formLoadedPages.has(page.pagePtr)) return;
    const m = this.module as unknown as {
      FORM_OnAfterLoadPage?: (pagePtr: number, env: number) => void;
    };
    if (!m.FORM_OnAfterLoadPage) return;
    try {
      m.FORM_OnAfterLoadPage(page.pagePtr, env);
      this.formLoadedPages.add(page.pagePtr);
    } catch {
      /* best-effort: the page still renders without the form layer */
    }
  }

  page(index: number): Page {
    const cached = this.pageCache.get(index);
    if (cached) return cached;
    const pagePtr = this.module.FPDF_LoadPage(this.docPtr, index);
    if (!pagePtr) {
      throw new Error(`EditorDocument: failed to load page ${index}`);
    }
    const width = this.module.FPDF_GetPageWidthF(pagePtr);
    const height = this.module.FPDF_GetPageHeightF(pagePtr);
    // CropBox/rotation transform for the screen boundary; identity for normal
    // pages (CropBox==MediaBox, /Rotate==0) so behaviour is unchanged there.
    const display = DisplayTransform.fromPage(
      this.module,
      pagePtr,
      width,
      height,
    );
    const page = new Page({ index, pagePtr, width, height, display });
    this.pageCache.set(index, page);
    return page;
  }

  /**
   * The page's structure elements and their unsaved edits.
   */
  structure(pageIndex: number): PageStructure {
    const cached = this.structureCache.get(pageIndex);
    if (cached) return cached;
    const structure = this.readStructure(pageIndex);
    this.structureCache.set(pageIndex, structure);
    return structure;
  }

  private readStructure(pageIndex: number): PageStructure {
    // PDFium's tree is the fallback, read-only: its MCIDs carry no page, so
    // an edit made through it could land on the wrong element.
    if (!this.fileStructure) {
      return new PageStructure(
        readPageStructure(this.module, this.page(pageIndex).pagePtr),
        this.encrypted() ? "encrypted" : "unreadable",
      );
    }
    const page = this.fileStructure.pages.get(pageIndex);
    if (!page) return new PageStructure([]);
    if (page.slotCount === null) return new PageStructure([], "unreadable");
    return new PageStructure(page.elements, null, page.slotCount, (key) =>
      this.retaggedAs(key),
    );
  }

  /**
   * The headings in reading order, the session's retags and added elements
   * applied. Null when the file's structure tree could not be read, which
   * leaves nothing to check them against.
   */
  headings(): DocumentHeading[] | null {
    if (!this.fileStructure) return null;
    const blocks: OutlineBlock[] = this.fileStructure.blocks.map(
      ({ key, type, pageIndex, mcids }) => ({
        key,
        type: this.retaggedAs(key) ?? type,
        pageIndex,
        mcids,
      }),
    );
    for (const [pageIndex, structure] of this.structureCache) {
      for (const edit of this.addedElementEdits(pageIndex, structure)) {
        const { type, after } = edit.newElement!;
        const anchor = after === null ? null : structure.block(after)?.key;
        blocks.splice(insertionPoint(blocks, pageIndex, anchor ?? null), 0, {
          key: structure.block(edit.mcid)!.key,
          type,
          pageIndex,
          mcids: [edit.mcid],
        });
      }
      for (const edit of this.cutEdits(pageIndex, structure)) {
        const owner = structure.element(edit.cut!.from[0])!.block.key;
        applyCut(blocks, pageIndex, edit, owner, structure);
      }
    }
    return blocks.flatMap(({ type, pageIndex, mcids, partOf }) =>
      isHeadingType(type)
        ? [{ type, pageIndex, mcids, ...(partOf && { partOf }) }]
        : [],
    );
  }

  /** The type the session has retagged block `key` as; null when it has not. */
  retaggedAs(key: string): StructureType | null {
    return this.retags.get(key)?.type ?? null;
  }

  /**
   * Retag the block the text `mcid` marks belongs to as `type`. Null, or the
   * type it has in the file, drops the change. Throws when cannotRetag
   * refuses it: a retag the save cannot write would fail every later save.
   */
  setRetag(pageIndex: number, mcid: number, type: StructureType | null): void {
    const structure = this.structure(pageIndex);
    const blocker = structure.cannotRetag(mcid);
    if (blocker) throw new Error(`MCID ${mcid} cannot be retagged: ${blocker}`);
    const block = structure.element(mcid)!.block;
    // An added element is not in the file yet: its type is just changed.
    const added = structure.addedBlockMcid(block.key);
    if (added !== null) {
      if (type !== null) structure.setAddedType(added, type);
      return;
    }
    if (type === null || type === block.type) {
      this.retags.delete(block.key);
    } else {
      // The save climbs from the element owning this to the same block.
      const address = structure.fileMcid(mcid)!;
      this.retags.set(block.key, { pageIndex, mcid: address, type });
    }
  }

  /** True when the catalog marks the file as tagged (ISO 32000-1 14.7.1). */
  isTagged(): boolean {
    try {
      return this.module.FPDFCatalog_IsTagged(this.docPtr);
    } catch {
      return false;
    }
  }

  private encrypted(): boolean {
    try {
      // -1 when the file has no security handler.
      return this.module.FPDF_GetSecurityHandlerRevision(this.docPtr) >= 0;
    } catch {
      return false;
    }
  }

  /** Every unsaved structure edit, in the form the save pass takes. */
  structureEdits(): StructureEdit[] {
    const retags = [...this.retags.values()].map(
      ({ pageIndex, mcid, type }) => ({
        pageIndex,
        mcid,
        type,
        decorative: false,
      }),
    );
    return [
      ...[...this.structureCache].flatMap(([pageIndex, structure]) => [
        ...structure.pendingEdits().map((edit) => ({ pageIndex, ...edit })),
        ...structure.innerEdits().map(({ mcid, type }) => ({
          pageIndex,
          mcid,
          ownType: type,
          decorative: false,
        })),
        ...this.addedElementEdits(pageIndex, structure),
        ...this.cutEdits(pageIndex, structure),
      ]),
      ...retags,
    ];
  }

  /**
   * The page's added elements in reading order, so one placed after another
   * finds it already in the tree. An element whose content was deleted is
   * left out: there is nothing left for it to tag.
   */
  private addedElementEdits(
    pageIndex: number,
    structure: PageStructure,
  ): StructureEdit[] {
    const page = this.pageCache.get(pageIndex);
    const added = new Map(
      structure.addedElements().map((element) => [element.mcid, element]),
    );
    if (!page || added.size === 0) return [];
    return taggedContentInReadingOrder(page).flatMap((content) => {
      const element = added.get(content.mcid);
      if (!element) return [];
      added.delete(content.mcid);
      const after = precedingTaggedMcid(page, content);
      return [
        {
          pageIndex,
          mcid: element.mcid,
          alt: element.alt,
          decorative: false,
          newElement: { type: element.type, after },
        },
      ];
    });
  }

  /**
   * The page's cuts, in the order made. One whose text was since deleted is
   * left out, and a part before or after it that was deleted is not kept.
   */
  private cutEdits(
    pageIndex: number,
    structure: PageStructure,
  ): StructureEdit[] {
    const page = this.pageCache.get(pageIndex);
    const cuts = structure.cutElements();
    if (!page || cuts.length === 0) return [];
    const carried = carriedMcids(this.module, page.pagePtr);
    return cuts.flatMap(({ mcid, type, alt, cut }) => {
      if (!carried.has(mcid)) return [];
      const kept = (part: number | null) =>
        part !== null && carried.has(part) ? part : null;
      const before = kept(cut.before);
      const after = kept(cut.after);
      return [
        {
          pageIndex,
          mcid,
          alt,
          decorative: false,
          cut: { type, from: cut.from, before, after },
        },
      ];
    });
  }

  registerOwnedFont(font: FontRef): void {
    this.ownedFonts.set(font.id, font);
  }

  ownedFont(id: string): FontRef | undefined {
    return this.ownedFonts.get(id);
  }

  /** Iterate loaded pages without forcing more page loads. */
  loadedPages(): Page[] {
    return Array.from(this.pageCache.values());
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    if (this.formEnvPtr) {
      const m = this.module as unknown as {
        FORM_OnBeforeClosePage?: (pagePtr: number, env: number) => void;
        FPDFDOC_ExitFormFillEnvironment?: (env: number) => void;
      };
      for (const pagePtr of this.formLoadedPages) {
        try {
          m.FORM_OnBeforeClosePage?.(pagePtr, this.formEnvPtr);
        } catch {
          /* best-effort */
        }
      }
      try {
        m.FPDFDOC_ExitFormFillEnvironment?.(this.formEnvPtr);
      } catch {
        /* best-effort */
      }
      this.formEnvPtr = null;
    }
    this.formLoadedPages.clear();
    for (const page of this.pageCache.values()) {
      try {
        this.module.FPDF_ClosePage(page.pagePtr);
      } catch {
        /* best-effort */
      }
    }
    this.pageCache.clear();
    this.structureCache.clear();
    for (const font of this.ownedFonts.values()) {
      font.dispose();
    }
    this.ownedFonts.clear();
    closeDocAndFreeBuffer(this.module, this.docPtr);
    releaseScratch(this.module);
  }
}

interface OutlineBlock {
  key: string;
  /** Null for an untyped block. */
  type: StructureType | null;
  pageIndex: number | null;
  /** In reading order. */
  mcids: number[];
  partOf?: number[];
}

/**
 * Change `blocks` as cutElements changes the tree for `edit`: an inline or
 * removed cut stays in its owner; any other splits the owner around it, the
 * owner keeping what is read before, a block of the owner's type taking what
 * is read after. Must stay in step with cutElements.
 */
function applyCut(
  blocks: OutlineBlock[],
  pageIndex: number,
  edit: StructureEdit,
  ownerKey: string,
  structure: PageStructure,
): void {
  const { type, from, before, after } = edit.cut!;
  // By MCID before key: a split owner's key stays on only one of its parts.
  let at = blocks.findIndex(
    (block) => block.pageIndex === pageIndex && block.mcids.includes(from[0]),
  );
  if (at < 0) at = blocks.findIndex((block) => block.key === ownerKey);
  const owner = blocks.at(at);
  const first = owner?.mcids.indexOf(from[0]) ?? -1;
  const last = owner?.mcids.indexOf(from.at(-1)!) ?? -1;
  const read = owner
    ? [...owner.mcids.slice(0, first), ...(before === null ? [] : [before])]
    : [];
  const later = owner
    ? [...(after === null ? [] : [after]), ...owner.mcids.slice(last + 1)]
    : [];

  if (type === null || isInlineType(type)) {
    if (owner && first >= 0) owner.mcids = [...read, edit.mcid, ...later];
    return;
  }
  const cut: OutlineBlock = {
    key: structure.block(edit.mcid)!.key,
    type,
    pageIndex,
    mcids: [edit.mcid],
  };
  if (!owner || first < 0 || last < 0) {
    blocks.splice(at < 0 ? blocks.length : at + 1, 0, cut);
    return;
  }
  cut.partOf = [...owner.mcids, ...read, ...later];
  if (read.length === 0 && later.length === 0) {
    blocks[at] = { ...cut, key: owner.key };
  } else if (read.length === 0) {
    owner.mcids = later;
    blocks.splice(at, 0, cut);
  } else if (later.length === 0) {
    owner.mcids = read;
    blocks.splice(at + 1, 0, cut);
  } else {
    owner.mcids = read;
    const rest = { ...owner, key: `${owner.key}:rest`, mcids: later };
    blocks.splice(at + 1, 0, cut, rest);
  }
}

/**
 * Where an added element goes among `blocks`, as the save places it: after
 * the block `anchor` names on its page, else before the page's first block,
 * else before the next page's.
 */
function insertionPoint(
  blocks: readonly { key: string; pageIndex: number | null }[],
  pageIndex: number,
  anchor: string | null,
): number {
  // Added keys repeat across pages; a file block spanning pages is listed
  // under its first.
  const onPage = blocks.findIndex(
    (block) => block.key === anchor && block.pageIndex === pageIndex,
  );
  const at =
    onPage >= 0 ? onPage : blocks.findIndex((block) => block.key === anchor);
  if (at >= 0) return at + 1;
  const next = blocks.findIndex(
    (block) => block.pageIndex !== null && block.pageIndex >= pageIndex,
  );
  return next >= 0 ? next : blocks.length;
}
