import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { RGBA } from "@editor/tools/pdfTextEditor/types";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

type ColourReader = (
  obj: number,
  r: number,
  g: number,
  b: number,
  a: number,
) => boolean;

/** A page object's fill colour, 0-255 per channel. Null when unreadable; never throws. */
export function readObjFill(
  m: WrappedPdfiumModule,
  objPtr: number,
): RGBA | null {
  return readObjColour(m, objPtr, m.FPDFPageObj_GetFillColor);
}

/** A page object's stroke colour, 0-255 per channel. Null when unreadable; never throws. */
export function readObjStroke(
  m: WrappedPdfiumModule,
  objPtr: number,
): RGBA | null {
  return readObjColour(m, objPtr, m.FPDFPageObj_GetStrokeColor);
}

function readObjColour(
  m: WrappedPdfiumModule,
  objPtr: number,
  read: ColourReader,
): RGBA | null {
  try {
    const buf = scratchPtr(m, SCRATCH.colourRGBA, 16);
    if (!read(objPtr, buf, buf + 4, buf + 8, buf + 12)) return null;
    return {
      r: m.pdfium.getValue(buf, "i32"),
      g: m.pdfium.getValue(buf + 4, "i32"),
      b: m.pdfium.getValue(buf + 8, "i32"),
      a: m.pdfium.getValue(buf + 12, "i32"),
    };
  } catch {
    return null;
  }
}
