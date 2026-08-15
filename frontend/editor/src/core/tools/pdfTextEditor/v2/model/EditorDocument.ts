import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocument,
} from "@app/services/pdfiumService";
import { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import { DisplayTransform } from "@app/tools/pdfTextEditor/v2/model/DisplayTransform";
import { FontRef } from "@app/tools/pdfTextEditor/v2/model/FontRef";
import { prepareForEditing } from "@app/tools/pdfTextEditor/v2/pdfdoc/prepareForEditing";

// Lifetime-managed PDFium document wrapper for the v2 text editor. - Opens a
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
  ) {
    this.module = module;
    this.docPtr = docPtr;
    this.openedBytes = openedBytes;
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
    return new EditorDocument(module, docPtr, keep);
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
    for (const font of this.ownedFonts.values()) {
      font.dispose();
    }
    this.ownedFonts.clear();
    closeDocAndFreeBuffer(this.module, this.docPtr);
  }
}
