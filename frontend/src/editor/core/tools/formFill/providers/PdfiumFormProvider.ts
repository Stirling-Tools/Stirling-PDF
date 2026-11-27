/**
 * PdfiumFormProvider Frontend-only form data provider using PDFium WASM.
 *
 * Extracts form fields directly from the PDF byte stream via @embedpdf/pdfium
 * WASM and fills them without any backend calls.
 *
 * Used in normal viewer mode when the user views a PDF with form fields.
 *
 * Coordinate system:
 * PDFium provides widget rectangles in PDF user space (lower-left origin).
 * We transform them to CSS space (top-left origin) matching what the backend
 * FormUtils.createWidgetCoordinates() does, so the same overlay code works
 * for both providers.
 */
import { PDF_FORM_FIELD_TYPE } from "@editor/services/pdfiumService";
import { getDocumentBytes } from "@editor/services/documentBytesCache";
import { documentHasFormFields } from "@editor/services/documentFormProbe";
import { runPdfiumScan } from "@editor/services/pdfiumScanQueue";
import { FPDF_ANNOT_WIDGET, FLAT_PRINT } from "@editor/utils/pdfiumBitmapUtils";
import type {
  FormField,
  FormFieldType,
  WidgetCoordinates,
  ButtonAction,
} from "@editor/tools/formFill/types";
import type { IFormDataProvider } from "@editor/tools/formFill/providers/types";
import {
  readAcroFormFieldInfo,
  type AcroFormFieldInfo,
} from "@editor/tools/formFill/providers/acroFormFieldInfo";
import {
  closeDocAndFreeBuffer,
  extractFormFields,
  getPdfiumModule,
  openRawDocumentSafe,
  readUtf16,
  saveRawDocument,
  type PdfiumFormField,
} from "@editor/services/pdfiumService";

/**
 * Map PDFium form field type enum to our FormFieldType string.
 */
function mapFieldType(t: PDF_FORM_FIELD_TYPE): FormFieldType {
  switch (t) {
    case PDF_FORM_FIELD_TYPE.TEXTFIELD:
      return "text";
    case PDF_FORM_FIELD_TYPE.CHECKBOX:
      return "checkbox";
    case PDF_FORM_FIELD_TYPE.COMBOBOX:
      return "combobox";
    case PDF_FORM_FIELD_TYPE.RADIOBUTTON:
      return "radio";
    case PDF_FORM_FIELD_TYPE.LISTBOX:
      return "listbox";
    case PDF_FORM_FIELD_TYPE.PUSHBUTTON:
      return "button";
    case PDF_FORM_FIELD_TYPE.SIGNATURE:
      return "signature";
    default:
      return "text";
  }
}

/**
 * Convert a PdfiumFormField (from pdfiumService) to the UI FormField shape.
 * @param optInfo      When provided, overrides options/displayOptions for combo/listbox fields.
 * @param buttonInfo   When provided, sets buttonLabel and buttonAction for push buttons.
 */
function toFormField(
  f: PdfiumFormField,
  optInfo?: { exportValues: string[]; displayValues: string[] } | null,
  buttonInfo?: { label?: string; action?: ButtonAction } | null,
): FormField {
  const type = mapFieldType(f.type);
  const optionLabels = f.options.map((o) => o.label);

  // Build WidgetCoordinates from the PDFium widget rects
  const widgets: WidgetCoordinates[] = f.widgets.map((w) => ({
    pageIndex: w.pageIndex,
    x: w.x,
    y: w.y,
    width: w.width,
    height: w.height,
    exportValue: w.exportValue,
    fontSize: w.fontSize,
  }));

  // Derive value string
  let value = f.value;
  if (type === "checkbox") {
    value = f.isChecked ? f.widgets[0]?.exportValue || "Yes" : "Off";
  } else if (type === "radio") {
    // Use widget index as the canonical radio value.
    // This avoids issues with duplicate exportValues across widgets
    // (e.g., all widgets having exportValue "Yes").
    value = "";
    for (let i = 0; i < f.widgets.length; i++) {
      if (f.widgets[i].isChecked) {
        value = String(i);
        break;
      }
    }
  }

  // Use the /Opt export/display values read from the AcroForm when available
  let options: string[] | null = optionLabels.length > 0 ? optionLabels : null;
  let displayOptions: string[] | null = null;
  if (optInfo && optInfo.exportValues.length > 0) {
    options = optInfo.exportValues;
    displayOptions = optInfo.displayValues;
  }

  return {
    name: f.name,
    label: f.name.split(".").pop() || f.name,
    type,
    value,
    options,
    displayOptions,
    required: f.isRequired,
    readOnly: f.isReadOnly,
    multiSelect: f.type === PDF_FORM_FIELD_TYPE.LISTBOX,
    multiline: type === "text" && (f.flags & 0x1000) !== 0, // bit 13 = Multiline
    tooltip: f.tooltip ?? null,
    widgets,
    buttonLabel: buttonInfo?.label ?? null,
    buttonAction: buttonInfo?.action ?? null,
  };
}

/**
 * PdfLibFormProvider — now backed by PDFium WASM.
 *
 * The class name is kept for backwards-compatibility with existing imports.
 * Internally everything goes through @embedpdf/pdfium.
 */
export class PdfiumFormProvider implements IFormDataProvider {
  /** Provider identifier — kept as 'pdf-lib' for backwards-compatibility. */
  readonly name = "pdf-lib";

  async fetchFields(file: File | Blob): Promise<FormField[]> {
    try {
      const arrayBuffer = await getDocumentBytes(file);
      if (!(await documentHasFormFields(arrayBuffer, file.size))) return [];
      const pdfiumFields = await runPdfiumScan(() =>
        extractFormFields(arrayBuffer),
      );

      // Enrichment (choice options, button labels/actions) needs the AcroForm
      // field tree, which the in-repo reader supplies without wasm. Read it
      // only when a field can use it; a failed read leaves the pdfium field
      // list untouched.
      const needsAcroInfo = pdfiumFields.some(
        (f) =>
          f.type === PDF_FORM_FIELD_TYPE.COMBOBOX ||
          f.type === PDF_FORM_FIELD_TYPE.LISTBOX ||
          f.type === PDF_FORM_FIELD_TYPE.PUSHBUTTON,
      );
      let acroInfo = new Map<string, AcroFormFieldInfo>();
      if (needsAcroInfo) {
        try {
          acroInfo = await readAcroFormFieldInfo(arrayBuffer);
        } catch (e) {
          console.warn(
            "[PdfiumFormProvider] Failed to read AcroForm field info:",
            e,
          );
        }
      }

      const optMap = new Map<
        string,
        { exportValues: string[]; displayValues: string[] }
      >();
      const buttonInfoMap = new Map<
        string,
        { label?: string; action?: ButtonAction }
      >();
      for (const f of pdfiumFields) {
        const info = acroInfo.get(f.name);
        if (!info) continue;
        if (
          (f.type === PDF_FORM_FIELD_TYPE.COMBOBOX ||
            f.type === PDF_FORM_FIELD_TYPE.LISTBOX) &&
          info.exportValues
        ) {
          optMap.set(f.name, {
            exportValues: info.exportValues,
            displayValues: info.displayValues ?? info.exportValues,
          });
        }
        if (
          f.type === PDF_FORM_FIELD_TYPE.PUSHBUTTON &&
          (info.label || info.action)
        ) {
          buttonInfoMap.set(f.name, {
            label: info.label,
            action: info.action,
          });
        }
      }

      return pdfiumFields
        .filter((f) => f.widgets.length > 0)
        .map((f) =>
          toFormField(
            f,
            optMap.get(f.name) ?? null,
            buttonInfoMap.get(f.name) ?? null,
          ),
        );
    } catch (err) {
      console.warn("[PdfiumFormProvider] Failed to extract form fields:", err);
      return [];
    }
  }

  async fillForm(
    file: File | Blob,
    values: Record<string, string>,
    flatten: boolean,
  ): Promise<Blob> {
    const arrayBuffer = await file.arrayBuffer();
    const m = await getPdfiumModule();
    const docPtr = await openRawDocumentSafe(arrayBuffer);

    try {
      const formInfoPtr = m.PDFiumExt_OpenFormFillInfo();
      const formEnvPtr = m.PDFiumExt_InitFormFillEnvironment(
        docPtr,
        formInfoPtr,
      );
      if (!formEnvPtr) {
        throw new Error("PDFium: failed to initialise form environment");
      }

      const pageCount = m.FPDF_GetPageCount(docPtr);

      // Track radio widget index per field for index-based matching.
      // The UI stores radio values as widget indices (e.g., "0", "1", "2").
      const radioWidgetIdx = new Map<string, number>();

      for (let pageIdx = 0; pageIdx < pageCount; pageIdx++) {
        const pagePtr = m.FPDF_LoadPage(docPtr, pageIdx);
        if (!pagePtr) continue;
        m.FORM_OnAfterLoadPage(pagePtr, formEnvPtr);

        const annotCount = m.FPDFPage_GetAnnotCount(pagePtr);
        for (let ai = 0; ai < annotCount; ai++) {
          const annotPtr = m.FPDFPage_GetAnnot(pagePtr, ai);
          if (!annotPtr) continue;
          if (m.FPDFAnnot_GetSubtype(annotPtr) !== FPDF_ANNOT_WIDGET) {
            m.FPDFPage_CloseAnnot(annotPtr);
            continue;
          }

          const nl = m.FPDFAnnot_GetFormFieldName(formEnvPtr, annotPtr, 0, 0);
          let fieldName = "";
          if (nl > 0) {
            const nb = m.pdfium.wasmExports.malloc(nl);
            m.FPDFAnnot_GetFormFieldName(formEnvPtr, annotPtr, nb, nl);
            fieldName = readUtf16(m, nb, nl);
            m.pdfium.wasmExports.free(nb);
          }

          if (!fieldName || !(fieldName in values)) {
            m.FPDFPage_CloseAnnot(annotPtr);
            continue;
          }

          const value = values[fieldName];
          const fieldType = m.FPDFAnnot_GetFormFieldType(formEnvPtr, annotPtr);

          try {
            if (fieldType === PDF_FORM_FIELD_TYPE.TEXTFIELD) {
              m.FORM_SetFocusedAnnot(formEnvPtr, annotPtr);
              m.FORM_SelectAllText(formEnvPtr, pagePtr);
              const wPtr = m.pdfium.wasmExports.malloc((value.length + 1) * 2);
              m.pdfium.stringToUTF16(value, wPtr, (value.length + 1) * 2);
              m.FORM_ReplaceSelection(formEnvPtr, pagePtr, wPtr);
              m.pdfium.wasmExports.free(wPtr);
              m.FORM_ForceToKillFocus(formEnvPtr);
            } else if (fieldType === PDF_FORM_FIELD_TYPE.CHECKBOX) {
              // Toggle checkbox using the same approach as @embedpdf engine:
              // Focus → Enter key (FORM_OnChar with keycode 13) → Kill focus.
              // Click simulation (FORM_OnLButtonDown/Up) does NOT reliably
              // persist checkbox state changes in headless/offscreen mode.
              const isCurrentlyChecked = m.FPDFAnnot_IsChecked(
                formEnvPtr,
                annotPtr,
              );
              const shouldBeChecked = value !== "" && value !== "Off";
              if (isCurrentlyChecked !== shouldBeChecked) {
                const ENTER_KEY = 13;
                m.FORM_SetFocusedAnnot(formEnvPtr, annotPtr);
                m.FORM_OnChar(formEnvPtr, pagePtr, ENTER_KEY, 0);
                m.FORM_ForceToKillFocus(formEnvPtr);
              }
            } else if (fieldType === PDF_FORM_FIELD_TYPE.RADIOBUTTON) {
              // Radio values are stored as widget indices (e.g., "0", "1", "2").
              // Track the current widget index for this field and toggle only
              // the widget whose index matches the stored value.
              const currentIdx = radioWidgetIdx.get(fieldName) ?? 0;
              radioWidgetIdx.set(fieldName, currentIdx + 1);

              const targetIdx = parseInt(value, 10);
              if (!isNaN(targetIdx) && currentIdx === targetIdx) {
                const isAlreadyChecked = m.FPDFAnnot_IsChecked(
                  formEnvPtr,
                  annotPtr,
                );
                if (!isAlreadyChecked) {
                  const ENTER_KEY = 13;
                  m.FORM_SetFocusedAnnot(formEnvPtr, annotPtr);
                  m.FORM_OnChar(formEnvPtr, pagePtr, ENTER_KEY, 0);
                  m.FORM_ForceToKillFocus(formEnvPtr);
                }
              }
            } else if (
              fieldType === PDF_FORM_FIELD_TYPE.COMBOBOX ||
              fieldType === PDF_FORM_FIELD_TYPE.LISTBOX
            ) {
              // FORM_SetIndexSelected requires the annotation to be focused first.
              m.FORM_SetFocusedAnnot(formEnvPtr, annotPtr);

              let matched = false;
              const optCount = m.FPDFAnnot_GetOptionCount(formEnvPtr, annotPtr);
              for (let oi = 0; oi < optCount; oi++) {
                const optLen = m.FPDFAnnot_GetOptionLabel(
                  formEnvPtr,
                  annotPtr,
                  oi,
                  0,
                  0,
                );
                if (optLen > 0) {
                  const ob = m.pdfium.wasmExports.malloc(optLen);
                  m.FPDFAnnot_GetOptionLabel(
                    formEnvPtr,
                    annotPtr,
                    oi,
                    ob,
                    optLen,
                  );
                  const optLabel = readUtf16(m, ob, optLen);
                  m.pdfium.wasmExports.free(ob);
                  if (optLabel === value) {
                    m.FORM_SetIndexSelected(formEnvPtr, pagePtr, oi, true);
                    matched = true;
                    break;
                  }
                }
              }

              // Fallback: set as text (handles editable combos or
              // cases where export values differ from display labels).
              if (!matched && value) {
                m.FORM_SelectAllText(formEnvPtr, pagePtr);
                const wPtr = m.pdfium.wasmExports.malloc(
                  (value.length + 1) * 2,
                );
                m.pdfium.stringToUTF16(value, wPtr, (value.length + 1) * 2);
                m.FORM_ReplaceSelection(formEnvPtr, pagePtr, wPtr);
                m.pdfium.wasmExports.free(wPtr);
              }

              m.FORM_ForceToKillFocus(formEnvPtr);
            }
          } catch (err) {
            console.warn(
              `[PdfiumFormProvider] Failed to set "${fieldName}":`,
              err,
            );
          }

          m.FPDFPage_CloseAnnot(annotPtr);
        }

        if (flatten) {
          m.FPDFPage_Flatten(pagePtr, FLAT_PRINT);
        }

        m.FORM_OnBeforeClosePage(pagePtr, formEnvPtr);
        m.FPDF_ClosePage(pagePtr);
      }

      m.PDFiumExt_ExitFormFillEnvironment(formEnvPtr);
      m.PDFiumExt_CloseFormFillInfo(formInfoPtr);

      const savedBytes = await saveRawDocument(docPtr);
      return new Blob([savedBytes], { type: "application/pdf" });
    } finally {
      closeDocAndFreeBuffer(m, docPtr);
    }
  }
}
