import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { charcodesResolveFully } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { fontCompletionFor } from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import { familyCoverage } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import { faceStyleOf } from "@editor/tools/pdfTextEditor/util/fontFaces";
import { isBoldWeight } from "@editor/tools/pdfTextEditor/util/faceNames";
import {
  documentFontHandle,
  familyOf,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import { helveticaVariantFor } from "@editor/tools/pdfTextEditor/util/helveticaVariant";

function lettersOf(text: string): string[] {
  return [...text].filter((ch) => /[\p{L}\p{N}]/u.test(ch));
}

function standardFaceLike(face: string): string {
  const style = faceStyleOf(face);
  return helveticaVariantFor(
    [
      familyOf(face),
      isBoldWeight(style.weight) ? "Bold" : "",
      style.italic ? "Italic" : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * The one face to draw `text` in instead of the document face `face` when that
 * subset lacks some of its letters, so a restyled word is never drawn half in
 * one typeface and half in another. Null when the subset draws every letter,
 * when the document's original font completes it (the same typeface), or when
 * no lookalike draws every letter either.
 */
export function wholeFaceLookalike(
  doc: EditorDocument,
  page: Page,
  face: string,
  text: string,
): string | null {
  const handle = documentFontHandle(face);
  if (!handle) return null;
  const completion = fontCompletionFor(face);
  if (completion?.source === "original") return null;
  const letters = lettersOf(text);
  const lacking = letters.some(
    (ch) =>
      !charcodesResolveFully(doc.module, handle, ch, page.pagePtr, doc.docPtr),
  );
  if (!lacking) return null;
  const lookalike = completion?.family ?? standardFaceLike(face);
  const draws = familyCoverage(doc, lookalike);
  if (draws && !letters.every((ch) => draws(ch.codePointAt(0) ?? 0)))
    return null;
  return lookalike;
}
