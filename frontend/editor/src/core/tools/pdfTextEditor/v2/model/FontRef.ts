import type { FontDescriptor } from "@app/tools/pdfTextEditor/v2/types";

/**
 * A handle to a font inside a PDFium document.
 *
 * `pointer` is the FPDF_FONT handle. `owned` decides whether `dispose()`
 * should call `FPDFFont_Close` (true for fonts loaded via FPDFText_LoadFont,
 * false for fonts borrowed via FPDFTextObj_GetFont).
 */
export class FontRef {
  readonly id: string;
  readonly descriptor: FontDescriptor;
  readonly pointer: number;
  private readonly owned: boolean;
  private closeFn: ((ptr: number) => void) | null;

  constructor(opts: {
    id: string;
    descriptor: FontDescriptor;
    pointer: number;
    owned: boolean;
    closeFn?: (ptr: number) => void;
  }) {
    this.id = opts.id;
    this.descriptor = opts.descriptor;
    this.pointer = opts.pointer;
    this.owned = opts.owned;
    this.closeFn = opts.closeFn ?? null;
  }

  dispose(): void {
    if (this.owned && this.closeFn && this.pointer) {
      this.closeFn(this.pointer);
    }
    this.closeFn = null;
  }
}
