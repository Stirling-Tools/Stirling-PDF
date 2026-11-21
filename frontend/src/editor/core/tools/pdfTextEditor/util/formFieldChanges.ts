import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { writeUtf16 } from "@editor/services/pdfiumService";
import { RawPdf } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  topLevelFieldNames,
  withSignatureField,
} from "@editor/tools/pdfTextEditor/pdfdoc/passes/pageAndFieldRevisions";
import { withFloats } from "@editor/tools/pdfTextEditor/util/pdfiumCopy";

export type FormFieldKind = "text" | "checkbox" | "signature";
/** Each field kind's size when placed, in points. */
export const FIELD_SIZES: Record<
  FormFieldKind,
  { width: number; height: number }
> = {
  text: { width: 180, height: 22 },
  checkbox: { width: 14, height: 14 },
  signature: { width: 180, height: 48 },
};

// PDF_FORM_FIELD_TYPE in @embedpdf/models.
const FIELD_TYPES: Record<Exclude<FormFieldKind, "signature">, number> = {
  text: 6,
  checkbox: 2,
};

const FIELD_NAMES: Record<FormFieldKind, string> = {
  text: "Text",
  checkbox: "Checkbox",
  signature: "Signature",
};

// PDFium creates no signature fields, so this one is appended as raw objects.
/** `bytes` with a signature field at a page point, or null when the file's structure is not one this can extend. */
export async function addSignatureField(
  bytes: Uint8Array,
  page: number,
  x: number,
  y: number,
): Promise<Uint8Array | null> {
  const { width, height } = FIELD_SIZES.signature;
  const pdf = await RawPdf.parse(bytes);
  return (
    pdf &&
    withSignatureField(
      pdf,
      page,
      uniqueName(topLevelFieldNames(pdf), "signature"),
      { x, y: y - height, width, height },
    )
  );
}

function uniqueName(taken: Set<string>, kind: FormFieldKind): string {
  let n = 1;
  while (taken.has(`${FIELD_NAMES[kind]}${n}`)) n++;
  return `${FIELD_NAMES[kind]}${n}`;
}

function formEnvironment(m: WrappedPdfiumModule, docPtr: number) {
  const info = m.PDFiumExt_OpenFormFillInfo();
  const handle = m.PDFiumExt_InitFormFillEnvironment(docPtr, info);
  return {
    handle,
    close: () => {
      m.PDFiumExt_ExitFormFillEnvironment(handle);
      m.PDFiumExt_CloseFormFillInfo(info);
    },
  };
}

const PRINT_FLAG = 4;
const SOLID_BORDER = 1;
const MK_BORDER_COLOUR = 0;
const HELVETICA = 4;
const FIELD_INK = [115, 115, 128] as const;

// A field with no border, no /DA and no print flag is invisible on the page
// and gives viewers no font to draw what is typed into it.
function drawAsBox(
  m: WrappedPdfiumModule,
  annot: number,
  kind: FormFieldKind,
): void {
  if (kind === "text")
    m.EPDFAnnot_SetDefaultAppearance(annot, HELVETICA, 11, 0, 0, 0);
  m.EPDFAnnot_SetBorderStyle(annot, SOLID_BORDER, 1);
  m.EPDFAnnot_SetMKColor(annot, MK_BORDER_COLOUR, ...FIELD_INK);
  m.FPDFAnnot_SetFlags(annot, PRINT_FLAG);
}

/** Adds a form field of `kind` with its top-left corner at a page point, named apart from the `taken` names. */
export function addField(
  m: WrappedPdfiumModule,
  docPtr: number,
  pagePtr: number,
  taken: Set<string>,
  kind: FormFieldKind,
  x: number,
  y: number,
) {
  const name = uniqueName(taken, kind);
  const { width, height } = FIELD_SIZES[kind];
  const env = formEnvironment(m, docPtr);
  try {
    m.FORM_OnAfterLoadPage(pagePtr, env.handle);
    try {
      const namePtr = writeUtf16(m, name);
      let annot = 0;
      try {
        annot = m.EPDFPage_CreateFormField(
          pagePtr,
          env.handle,
          FIELD_TYPES[kind as Exclude<FormFieldKind, "signature">],
          namePtr,
        );
      } finally {
        m.pdfium.wasmExports.free(namePtr);
      }
      if (!annot) throw new Error("PDFium could not create the form field");
      try {
        withFloats(m, 4, (rect) => {
          [x, y, x + width, y - height].forEach((value, i) =>
            m.pdfium.setValue(rect + i * 4, value, "float"),
          );
          if (!m.FPDFAnnot_SetRect(annot, rect))
            throw new Error("PDFium could not place the form field");
        });
        drawAsBox(m, annot, kind);
        m.EPDFAnnot_GenerateFormFieldAP(annot);
      } finally {
        m.FPDFPage_CloseAnnot(annot);
      }
    } finally {
      m.FORM_OnBeforeClosePage(pagePtr, env.handle);
    }
  } finally {
    env.close();
  }
}
