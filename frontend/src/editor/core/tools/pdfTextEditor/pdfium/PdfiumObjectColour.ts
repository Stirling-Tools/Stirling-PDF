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
  const r = scratchPtr(m, SCRATCH.colourR, 4);
  const g = scratchPtr(m, SCRATCH.colourG, 4);
  const b = scratchPtr(m, SCRATCH.colourB, 4);
  const a = scratchPtr(m, SCRATCH.colourA, 4);
  try {
    if (!read(objPtr, r, g, b, a)) return null;
    return {
      r: m.pdfium.getValue(r, "i32"),
      g: m.pdfium.getValue(g, "i32"),
      b: m.pdfium.getValue(b, "i32"),
      a: m.pdfium.getValue(a, "i32"),
    };
  } catch {
    return null;
  }
}
