import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocument,
} from "@editor/services/pdfiumService";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import {
  PageStructure,
  givenMcids,
  isInlineType,
  type AddedElement,
  type CutElement,
  type ReadOnlyReason,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import {
  effectiveLanguage,
  type TextLanguage,
} from "@editor/tools/pdfTextEditor/model/languageTag";
import type { AnnotationEdit } from "@editor/tools/pdfTextEditor/pdfdoc/passes/applyAnnotationEdits";
import type { StructureEdit } from "@editor/tools/pdfTextEditor/pdfdoc/passes/applyStructureEdits";
import {
  readPageStructure,
  readString,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumStructureReader";
import {
  artifactMarkRefs,
  carriedMcids,
  forgetArtifactKinds,
  forgetArtifactMarks,
  registerArtifactKinds,
  type ArtifactMarkRef,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import {
  readFileArtifactKinds,
  refreshArtifactTags,
} from "@editor/tools/pdfTextEditor/model/fileArtifactKinds";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
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
import { fieldAnchor } from "@editor/tools/pdfTextEditor/util/formLabel";
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
/** How long the file stays parsed after the last artifact kind read, for the pages read next. */
const RAW_PDF_GRACE_MS = 10_000;

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
  /** Unsaved /Lang changes to the file's blocks, by block key, held here as retags are. */
  private readonly blockLangs = new Map<
    string,
    { pageIndex: number; mcid: number; lang: string | null }
  >();
  /** The catalog /Lang as the file has it; null when it has none. */
  private readonly fileDocumentLang: string | null;
  /** The session's catalog /Lang; undefined when unchanged. */
  private documentLangEdit: string | null | undefined;
  /** The file's own structure tree; null when only PDFium's view is available. */
  private readonly fileStructure: FileStructure | null;
  private marked: boolean;
  private readonly ownedFonts: Map<string, FontRef>;
  private readonly embeddedFonts: Uint8Array[] = [];
  private _disposed: boolean;
  // Form-fill environment. Widgets with no appearance stream are drawn ONLY by
  // this layer, so without it such fields are invisible in the editor while
  // being visible everywhere else in the app. Created lazily and left null when
  // the build lacks the entry points.
  private formEnvPtr: number | null = null;
  private formEnvTried = false;
  private readonly formLoadedPages = new Set<number>();
  /** By page index, as each page is first read: the artifact marks whose kinds only the file names. */
  private readonly artifactMarks = new Map<number, ArtifactMarkRef[]>();
  private readonly artifactKindReads = new Map<number, Promise<boolean>>();
  private readonly artifactKindListeners = new Set<
    (pageIndex: number) => void
  >();
  /**
   * The opened bytes parsed, shared by the artifact kind reads in flight and
   * dropped soon after the last: it holds a second copy of the file.
   */
  private raw: {
    pdf: Promise<RawPdf | null>;
    reads: number;
    release?: ReturnType<typeof setTimeout>;
  } | null = null;

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
    this.fileDocumentLang = readCatalogLang(module, docPtr);
    this.marked = fileStructure?.marked ?? false;
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
      keep.length > 0 ? await readFileStructure(keep).catch(() => null) : null;
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
   * Note the page's artifact marks whose kinds only the file names, and
   * start reading those kinds. Must run as the page is first read, before
   * any edit and before any of its marks is read: PdfiumTextReader.populate
   * calls it.
   */
  claimArtifactMarks(pageIndex: number): void {
    if (this.artifactMarks.has(pageIndex)) return;
    const refs = artifactMarkRefs(this.module, this.page(pageIndex).pagePtr);
    forgetArtifactMarks(
      this.module,
      refs.map((ref) => ref.ptr),
    );
    this.artifactMarks.set(pageIndex, refs);
    if (refs.length > 0) void this.loadArtifactKinds(pageIndex);
  }

  /**
   * Resolves once the kinds the file names for the page's artifacts are
   * read: true when they were, the page's runs then carrying them and each
   * onArtifactKinds listener told. Never rejects.
   */
  loadArtifactKinds(pageIndex: number): Promise<boolean> {
    this.claimArtifactMarks(pageIndex);
    let read = this.artifactKindReads.get(pageIndex);
    if (!read) {
      read = this.readArtifactKinds(pageIndex).catch(() => false);
      this.artifactKindReads.set(pageIndex, read);
    }
    return read;
  }

  /** Hear of each page whose artifact kinds have been read. Returns the unsubscribe. */
  onArtifactKinds(listener: (pageIndex: number) => void): () => void {
    this.artifactKindListeners.add(listener);
    return () => this.artifactKindListeners.delete(listener);
  }

  private async readArtifactKinds(pageIndex: number): Promise<boolean> {
    const refs = this.artifactMarks.get(pageIndex) ?? [];
    if (refs.length === 0 || this.openedBytes.length === 0) return false;
    const kinds = await this.withRawPdf((pdf) => {
      const pageNum = pdf.encrypted ? null : pdf.pageNumberAt(pageIndex);
      return pageNum === null
        ? Promise.resolve(null)
        : readFileArtifactKinds(pdf, pageNum, refs);
    });
    if (!kinds || this._disposed) return false;
    const page = this.page(pageIndex);
    // Only marks still on the page: one an edit freed meanwhile may be
    // another page's by now.
    const live = new Set(
      artifactMarkRefs(this.module, page.pagePtr).map((ref) => ref.ptr),
    );
    registerArtifactKinds(
      this.module,
      this,
      new Map([...kinds].filter(([ptr]) => live.has(ptr))),
    );
    refreshArtifactTags(this.module, page);
    page.bumpRevision();
    for (const listener of this.artifactKindListeners) listener(pageIndex);
    return true;
  }

  private async withRawPdf<T>(
    read: (pdf: RawPdf) => Promise<T | null>,
  ): Promise<T | null> {
    this.raw ??= { pdf: RawPdf.parse(this.openedBytes), reads: 0 };
    const raw = this.raw;
    clearTimeout(raw.release);
    raw.reads += 1;
    try {
      const pdf = await raw.pdf;
      return pdf ? await read(pdf) : null;
    } finally {
      raw.reads -= 1;
      if (raw.reads === 0 && !this._disposed) {
        raw.release = setTimeout(() => {
          if (this.raw === raw) this.raw = null;
        }, RAW_PDF_GRACE_MS);
      }
    }
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
    const annotations = {
      links: this.fileStructure.links.get(pageIndex) ?? [],
      widgets: this.fileStructure.widgets.get(pageIndex) ?? [],
    };
    const retaggedAs = (key: string) => this.retaggedAs(key);
    if (!page) return new PageStructure([], null, 0, retaggedAs, annotations);
    if (page.slotCount === null) return new PageStructure([], "unreadable");
    return new PageStructure(
      page.elements,
      null,
      page.slotCount,
      retaggedAs,
      annotations,
    );
  }

  /**
   * The headings in reading order, the session's retags, decorative marks
   * and added elements applied. Null when the file's structure tree could not
   * be read, which leaves nothing to check them against.
   */
  headings(): DocumentHeading[] | null {
    if (!this.fileStructure) return null;
    const blocks: OutlineBlock[] = this.fileStructure.blocks
      .filter(
        ({ pageIndex, mcids }) => !this.markedDecorative(pageIndex, mcids),
      )
      .map(({ key, type, pageIndex, mcids }) => ({
        key,
        type: this.retaggedAs(key) ?? type,
        pageIndex,
        mcids,
      }));
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

  /** True when the session marked the block owning `mcids` decorative. */
  private markedDecorative(pageIndex: number | null, mcids: number[]): boolean {
    if (pageIndex === null || mcids.length === 0) return false;
    return this.structureCache.get(pageIndex)?.decorative(mcids[0]) ?? false;
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

  /** The language the document is read in, as the session has it; null when unknown. */
  documentLanguage(): string | null {
    return this.documentLangEdit === undefined
      ? this.fileDocumentLang
      : this.documentLangEdit;
  }

  /** Why the save cannot write the document's language, or null when it can. */
  cannotSetDocumentLanguage(): ReadOnlyReason | null {
    return this.encrypted() ? "encrypted" : null;
  }

  /** Set or, with null, remove the document's language. Throws when cannotSetDocumentLanguage refuses it. */
  setDocumentLanguage(lang: string | null): void {
    const blocker = this.cannotSetDocumentLanguage();
    if (blocker) throw new Error(`The document language is ${blocker}`);
    this.documentLangEdit = lang === this.fileDocumentLang ? undefined : lang;
  }

  /** The unsaved document language, for the save; undefined when unchanged. */
  documentLanguageEdit(): string | null | undefined {
    return this.documentLangEdit;
  }

  /**
   * Every language the document is read in as the session has it: its own
   * and each element's. An element's from the file is left out once the
   * session changes it; one PDFium alone reads is left out unless set here.
   */
  languagesInUse(): string[] {
    const edited = new Map<string, string | null>();
    for (const structure of this.structureCache.values()) {
      for (const [key, lang] of structure.ownLangEdits()) edited.set(key, lang);
    }
    for (const [key, { lang }] of this.blockLangs) edited.set(key, lang);
    const fromFile = [...(this.fileStructure?.languages ?? [])].map(
      ([key, { lang }]) => (edited.has(key) ? null : lang),
    );
    return [
      ...new Set(
        [this.documentLanguage(), ...fromFile, ...edited.values()].filter(
          (lang): lang is string => lang !== null,
        ),
      ),
    ];
  }

  /**
   * The language of the block the text `mcid` marks belongs to; null when no
   * element owns it.
   */
  textLanguage(pageIndex: number, mcid: number): TextLanguage | null {
    const block = this.structure(pageIndex).block(mcid);
    if (!block) return null;
    const structure = this.structure(pageIndex);
    // An added block's parent is chosen by the save, so it is read as the
    // document's.
    if (structure.addedBlockMcid(block.key) !== null) {
      return {
        own: structure.ownLang(block.key),
        inherited: this.documentLanguage(),
      };
    }
    const file = this.fileStructure?.languages.get(block.key);
    const edit = this.blockLangs.get(block.key);
    return {
      own: edit ? edit.lang : (file?.lang ?? null),
      inherited: this.inheritedLanguage(
        pageIndex,
        block.key,
        this.documentLanguage(),
      ),
    };
  }

  /**
   * The language of element `key`, one marking part of the text `mcid`
   * marks, read inside that text's block. Throws when the page has no such
   * element.
   */
  innerLanguage(pageIndex: number, mcid: number, key: string): TextLanguage {
    const block = this.textLanguage(pageIndex, mcid);
    return {
      own: this.structure(pageIndex).ownLang(key),
      inherited: this.inheritedLanguage(
        pageIndex,
        key,
        block ? effectiveLanguage(block) : this.documentLanguage(),
      ),
    };
  }

  private inheritedLanguage(
    pageIndex: number,
    key: string,
    fallback: string | null,
  ): string | null {
    const languages = this.fileStructure?.languages;
    const element = languages?.get(key);
    if (!languages || !element) return fallback;
    const edits = this.structure(pageIndex).ownLangEdits();
    const seen = new Set([key]);
    let parent = element.parent;
    while (parent !== null && !seen.has(parent)) {
      seen.add(parent);
      const ancestor = languages.get(parent);
      if (!ancestor) break;
      const blockEdit = this.blockLangs.get(parent);
      const lang = blockEdit
        ? blockEdit.lang
        : edits.has(parent)
          ? edits.get(parent)!
          : ancestor.lang;
      if (lang !== null) return lang;
      parent = ancestor.parent;
    }
    return this.documentLanguage();
  }

  /**
   * Set or, with null, remove the /Lang of the block the text `mcid` marks
   * belongs to. Throws when cannotRetag refuses the block, or the page's
   * save cannot write it.
   */
  setTextLanguage(pageIndex: number, mcid: number, lang: string | null): void {
    const structure = this.structure(pageIndex);
    const blocker = structure.cannotSetLanguage(mcid);
    if (blocker) {
      throw new Error(`MCID ${mcid} cannot take a language: ${blocker}`);
    }
    const block = structure.block(mcid)!;
    if (structure.addedBlockMcid(block.key) !== null) {
      structure.setOwnLang(block.key, lang);
      return;
    }
    const fileLang = this.fileStructure?.languages.get(block.key)?.lang ?? null;
    if (lang === fileLang) {
      this.blockLangs.delete(block.key);
    } else {
      // The save climbs from the element owning this to the same block.
      const address = structure.fileMcid(mcid)!;
      this.blockLangs.set(block.key, { pageIndex, mcid: address, lang });
    }
  }

  /**
   * True when the catalog marks the file as tagged (ISO 32000-1 14.7.1), or
   * the save can write tags into it, creating its structure tree if need be.
   * Not a promise that tags can be edited: an encrypted tagged file is true
   * here and read-only in its PageStructure, which decides that.
   */
  treatAsTagged(): boolean {
    if (this.fileStructure) return true;
    try {
      return this.module.FPDFCatalog_IsTagged(this.docPtr);
    } catch {
      return false;
    }
  }

  /**
   * Whether the saved file declares itself tagged (/MarkInfo /Marked). Kept
   * apart from the tags themselves so unfinished tags do not claim the file is
   * tagged, which readers that honour the flag would then read by.
   */
  markedTagged(): boolean {
    return this.marked;
  }

  /** False when the file cannot be parsed or is encrypted: the flag is fixed. */
  canSetMarkedTagged(): boolean {
    return this.fileStructure !== null;
  }

  /** Throws when canSetMarkedTagged() is false. */
  setMarkedTagged(marked: boolean): void {
    if (!this.canSetMarkedTagged()) {
      throw new Error("this file's tagged flag can't be changed");
    }
    this.marked = marked;
  }

  /** True when the save must write /MarkInfo /Marked. */
  markedTaggedChanged(): boolean {
    return (
      this.fileStructure !== null && this.marked !== this.fileStructure.marked
    );
  }

  /** True when the saved file will have a structure tree, the file's own or one the save creates. */
  hasStructureTree(): boolean {
    if (this.fileStructure?.hasTree) return true;
    return this.structureEdits().some((edit) => edit.newElement);
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
    const blockLangs = [...this.blockLangs.values()].map(
      ({ pageIndex, mcid, lang }) => ({
        pageIndex,
        mcid,
        blockLang: lang,
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
        ...structure.langEdits().map(({ mcid, lang }) => ({
          pageIndex,
          mcid,
          lang,
          decorative: false,
        })),
        ...this.addedElementEdits(pageIndex, structure),
        ...this.cutEdits(pageIndex, structure),
      ]),
      ...retags,
      ...blockLangs,
    ];
  }

  /** Every unsaved change to a link or form field annotation, in the form the save pass takes. */
  annotationEdits(): AnnotationEdit[] {
    return [...this.structureCache].flatMap(([pageIndex, structure]) => [
      ...this.linkEdits(pageIndex, structure),
      ...this.formFieldEdits(pageIndex, structure),
    ]);
  }

  /**
   * A link whose holder's text is no longer on the page is left unheld, as
   * the save drops a session element with no text (cutEdits,
   * addedElementEdits).
   */
  private linkEdits(
    pageIndex: number,
    structure: PageStructure,
  ): AnnotationEdit[] {
    const page = this.pageCache.get(pageIndex);
    const carried = page && carriedMcids(this.module, page.pagePtr);
    return structure.linkEdits().flatMap(({ mcid, ...edit }) => {
      const held = mcid !== undefined && (!carried || carried.has(mcid));
      if (!held && edit.contents === undefined) return [];
      return [{ pageIndex, ...edit, ...(held && { mcid }) }];
    });
  }

  /** A new Form reads where fieldAnchor places it on the page as the save finds it. */
  private formFieldEdits(
    pageIndex: number,
    structure: PageStructure,
  ): AnnotationEdit[] {
    const page = this.pageCache.get(pageIndex);
    return structure.formFields.edits().map(({ widget, newForm, ...edit }) => ({
      pageIndex,
      annotation: widget.annotation,
      ...edit,
      ...(newForm && {
        newForm: { after: page ? fieldAnchor(page, widget) : null },
      }),
    }));
  }

  /**
   * The page's added elements, each after the added element it reads after,
   * so it finds that already in the tree. Text cut from an element stands
   * for it, which keeps one whose text was all cut out. An element whose
   * content was deleted is left out: there is nothing left for it to tag.
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
    const content = taggedContentInReadingOrder(page);
    // The save writes a cut from an added element after every added element,
    // so content is placed beside the element its text was cut from.
    const owners = addedOwners(added, structure.cutElements());
    const ownerOf = (mcid: number) => owners.get(mcid) ?? mcid;
    const present = new Set(content.map(({ mcid }) => ownerOf(mcid)));
    const edits = new Map<number, StructureEdit>();
    for (const item of content) {
      const element = added.get(ownerOf(item.mcid));
      if (!element) continue;
      added.delete(element.mcid);
      const { follows } = element;
      const preceding = () => {
        const mcid = precedingTaggedMcid(page, item);
        return mcid === null ? null : ownerOf(mcid);
      };
      const after =
        follows === null || (follows !== undefined && present.has(follows))
          ? follows
          : preceding();
      edits.set(element.mcid, {
        pageIndex,
        mcid: element.mcid,
        alt: element.alt,
        lang: element.lang,
        decorative: false,
        newElement: { type: element.type, after },
      });
    }
    return anchorsFirst(edits);
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
    return cuts.flatMap(({ mcid, type, alt, lang, cut }) => {
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
          lang,
          decorative: false,
          cut: { type, from: cut.from, before, after },
        },
      ];
    });
  }

  /**
   * Note a font file handed to PDFium for embedding in this document. PDFium
   * writes such a font whole; the save uses these to find and subset them.
   */
  recordEmbeddedFontFile(bytes: Uint8Array): void {
    this.embeddedFonts.push(bytes);
  }

  /** The exact font files embedded into this document during the session. */
  embeddedFontFiles(): readonly Uint8Array[] {
    return this.embeddedFonts;
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
    clearTimeout(this.raw?.release);
    this.raw = null;
    this.artifactKindListeners.clear();
    forgetArtifactKinds(this.module, this);
    closeDocAndFreeBuffer(this.module, this.docPtr);
    releaseScratch(this.module);
  }
}

/** The catalog /Lang; null when absent, empty, or unreadable. */
function readCatalogLang(
  module: WrappedPdfiumModule,
  docPtr: number,
): string | null {
  try {
    return readString(module, docPtr, module.FPDFCatalog_GetLanguage) || null;
  } catch {
    return null;
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

/**
 * The added element each cut's text was taken from, through cuts from cuts,
 * by the cut's MCID and those it gave the text it was cut from. Cuts from
 * the file's elements are left out.
 */
function addedOwners(
  added: ReadonlyMap<number, AddedElement>,
  cuts: readonly CutElement[],
): Map<number, number> {
  const owners = new Map<number, number>();
  for (const { mcid, cut } of cuts) {
    const from = cut.from[0];
    const owner = added.has(from) ? from : owners.get(from);
    if (owner === undefined) continue;
    for (const part of [mcid, ...givenMcids(cut)]) owners.set(part, owner);
  }
  return owners;
}

/**
 * `edits`, keyed by MCID, reordered so each comes after the edit adding the
 * element it is placed after. A cycle is broken where it closes, that element
 * placing as though its anchor were not added.
 */
function anchorsFirst(edits: Map<number, StructureEdit>): StructureEdit[] {
  const ordered: StructureEdit[] = [];
  for (const start of [...edits.keys()]) {
    const chain: StructureEdit[] = [];
    let mcid: number | null = start;
    while (mcid !== null && edits.has(mcid)) {
      const edit: StructureEdit = edits.get(mcid)!;
      edits.delete(mcid);
      chain.push(edit);
      mcid = edit.newElement!.after;
    }
    ordered.push(...chain.reverse());
  }
  return ordered;
}
