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
export class EditorDocument {
  readonly module: WrappedPdfiumModule;
  readonly docPtr: number;
  /** Exactly the bytes PDFium was handed: the save-time repairs re-read them. */
  readonly openedBytes: Uint8Array;
  private readonly pageCache: Map<number, Page>;
  private readonly ownedFonts: Map<string, FontRef>;
  private _disposed: boolean;

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
    return new EditorDocument(module, docPtr, prepared);
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
