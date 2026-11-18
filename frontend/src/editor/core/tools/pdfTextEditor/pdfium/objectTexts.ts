import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  SCRATCH,
  scratchPtr,
} from "@editor/tools/pdfTextEditor/util/wasmScratch";

export interface CharOriginModule {
  FPDFText_GetCharOrigin?: (
    textPage: number,
    index: number,
    x: number,
    y: number,
  ) => boolean;
}

interface ObjectText {
  text: string;
  /** Baseline of the line being read, as PDFium tracks it. */
  y: number;
  /** How many non-space characters the page had drawn when this object last took one. */
  seen: number;
}

const SPACE = 0x20;

/**
 * The text of every text object on a text page, keyed by object pointer, or
 * null when this build cannot say which object a character belongs to.
 *
 * Each entry is what `FPDFTextObj_GetText` returns for that object. That call
 * walks every character on the page for one object, so reading a page object
 * by object costs objects times characters: seconds on a page of a few thousand
 * labels. This walks the characters once, following the same rules: a space
 * straight after an object's characters is added to them, and a line break
 * goes in where the object's text resumes on another baseline after other
 * text.
 */
export function readObjectTexts(
  m: WrappedPdfiumModule,
  textPagePtr: number,
): Map<number, string> | null {
  const origin = (m as unknown as CharOriginModule).FPDFText_GetCharOrigin;
  if (!origin || typeof m.FPDFText_GetTextObject !== "function") return null;
  const count = m.FPDFText_CountChars(textPagePtr);
  const xPtr = scratchPtr(m, SCRATCH.readerCharX, 8);
  const yPtr = scratchPtr(m, SCRATCH.readerCharY, 8);
  const objects = new Map<number, ObjectText>();
  let nonSpaces = 0;
  // The object the last character belonged to, until another object's character follows.
  let open: ObjectText | null = null;
  for (let i = 0; i < count; i++) {
    const unicode = m.FPDFText_GetUnicode(textPagePtr, i);
    const ptr = m.FPDFText_GetTextObject(textPagePtr, i);
    let owner = ptr ? (objects.get(ptr) ?? null) : null;
    if (ptr && !owner) {
      owner = { text: "", y: 0, seen: 0 };
      objects.set(ptr, owner);
    }
    if (open && open !== owner) {
      if (unicode === SPACE) {
        open.text += " ";
        open.seen = nonSpaces;
      }
      open = null;
    }
    const before = nonSpaces;
    if (unicode !== SPACE) nonSpaces += 1;
    if (!owner) continue;
    const y = origin(textPagePtr, i, xPtr, yPtr)
      ? m.pdfium.getValue(yPtr, "double")
      : owner.y;
    if (owner.y !== y && open !== owner && before > owner.seen) {
      owner.y = y;
      if (owner.text) owner.text += "\r\n";
    }
    if (unicode) owner.text += String.fromCodePoint(unicode);
    owner.seen = nonSpaces;
    open = owner;
  }
  const texts = new Map<number, string>();
  for (const [ptr, object] of objects) texts.set(ptr, object.text);
  return texts;
}
