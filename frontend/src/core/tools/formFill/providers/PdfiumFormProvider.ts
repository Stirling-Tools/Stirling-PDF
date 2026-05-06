/**
 * PdfiumFormProvider Frontend-only form data provider using PDFium WASM.
 *
 * Replaces the old pdf-lib based PdfLibFormProvider.  Extracts form fields
 * directly from the PDF byte stream via @embedpdf/pdfium WASM and fills
 * them without any backend calls.
 *
 * Used in normal viewer mode when the user views a PDF with form fields.
 *
 * Coordinate system:
 * PDFium provides widget rectangles in PDF user space (lower-left origin).
 * We transform them to CSS space (top-left origin) matching what the backend
 * FormUtils.createWidgetCoordinates() does, so the same overlay code works
 * for both providers.
 */
import { PDF_FORM_FIELD_TYPE } from "@app/services/pdfiumService";
import { FPDF_ANNOT_WIDGET, FLAT_PRINT } from "@app/utils/pdfiumBitmapUtils";
import type {
  FormField,
  FormFieldType,
  WidgetCoordinates,
  ButtonAction,
} from "@app/tools/formFill/types";
import type { IFormDataProvider } from "@app/tools/formFill/providers/types";
import {
  closeDocAndFreeBuffer,
  extractFormFields,
  getPdfiumModule,
  openRawDocumentSafe,
  readUtf16,
  saveRawDocument,
  type PdfiumFormField,
} from "@app/services/pdfiumService";

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
  f: PdfiumFormField & { _tooltip?: string | null },
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
    value = f.isChecked ? "Yes" : "Off";
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

  // Use pdf-lib extracted export/display values when available
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
    tooltip: f._tooltip ?? null,
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
      const arrayBuffer = await file.arrayBuffer();
      const pdfiumFields = await extractFormFields(arrayBuffer);

      // Enrich with alternate names (tooltips)
      await this.enrichWithAlternateNames(arrayBuffer, pdfiumFields);

      // Enrich combo/listbox fields with export/display values from pdf-lib
      const optMap = await this.extractDisplayOptions(
        arrayBuffer,
        pdfiumFields,
      );

      // Enrich push buttons with label (/MK/CA) and action (/A) from pdf-lib
      const buttonInfoMap = await this.extractButtonInfo(
        arrayBuffer,
        pdfiumFields,
      );

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

  /**
   * Enrich fields with alternate names (tooltip / TU entry) via PDFium.
   */
  private async enrichWithAlternateNames(
    data: ArrayBuffer,
    fields: PdfiumFormField[],
  ): Promise<void> {
    try {
      const m = await getPdfiumModule();
      const docPtr = await openRawDocumentSafe(data);
      try {
        const formInfoPtr = m.PDFiumExt_OpenFormFillInfo();
        const formEnvPtr = m.PDFiumExt_InitFormFillEnvironment(
          docPtr,
          formInfoPtr,
        );
        if (!formEnvPtr) return;

        const pageCount = m.FPDF_GetPageCount(docPtr);
        const nameToField = new Map(fields.map((f) => [f.name, f]));
        const enriched = new Set<string>();

        for (
          let pageIdx = 0;
          pageIdx < pageCount && enriched.size < nameToField.size;
          pageIdx++
        ) {
          const pagePtr = m.FPDF_LoadPage(docPtr, pageIdx);
          if (!pagePtr) continue;
          m.FORM_OnAfterLoadPage(pagePtr, formEnvPtr);

          const annotCount = m.FPDFPage_GetAnnotCount(pagePtr);
          for (
            let ai = 0;
            ai < annotCount && enriched.size < nameToField.size;
            ai++
          ) {
            const annotPtr = m.FPDFPage_GetAnnot(pagePtr, ai);
            if (!annotPtr) continue;
            if (m.FPDFAnnot_GetSubtype(annotPtr) !== FPDF_ANNOT_WIDGET) {
              m.FPDFPage_CloseAnnot(annotPtr);
              continue;
            }

            const nl = m.FPDFAnnot_GetFormFieldName(formEnvPtr, annotPtr, 0, 0);
            let name = "";
            if (nl > 0) {
              const nb = m.pdfium.wasmExports.malloc(nl);
              m.FPDFAnnot_GetFormFieldName(formEnvPtr, annotPtr, nb, nl);
              name = readUtf16(m, nb, nl);
              m.pdfium.wasmExports.free(nb);
            }

            if (name && nameToField.has(name) && !enriched.has(name)) {
              const altLen = m.FPDFAnnot_GetFormFieldAlternateName(
                formEnvPtr,
                annotPtr,
                0,
                0,
              );
              if (altLen > 0) {
                const altBuf = m.pdfium.wasmExports.malloc(altLen);
                m.FPDFAnnot_GetFormFieldAlternateName(
                  formEnvPtr,
                  annotPtr,
                  altBuf,
                  altLen,
                );
                const altName = readUtf16(m, altBuf, altLen);
                m.pdfium.wasmExports.free(altBuf);
                (nameToField.get(name) as any)._tooltip = altName || null;
              }
              enriched.add(name);
            }

            m.FPDFPage_CloseAnnot(annotPtr);
          }

          m.FORM_OnBeforeClosePage(pagePtr, formEnvPtr);
          m.FPDF_ClosePage(pagePtr);
        }

        m.PDFiumExt_ExitFormFillEnvironment(formEnvPtr);
        m.PDFiumExt_CloseFormFillInfo(formInfoPtr);
      } finally {
        closeDocAndFreeBuffer(m, docPtr);
      }
    } catch (e) {
      console.warn("[PdfiumFormProvider] Failed to enrich alternate names:", e);
    }
  }

  /**
   * Use pdf-lib to read /Opt arrays for combo/listbox fields.
   * Returns a map of fieldName → { exportValues, displayValues }.
   * PDFium only exposes display labels; pdf-lib can read the raw /Opt entries
   * to separate [export, display] pairs.
   */
  private async extractDisplayOptions(
    data: ArrayBuffer,
    fields: PdfiumFormField[],
  ): Promise<Map<string, { exportValues: string[]; displayValues: string[] }>> {
    const result = new Map<
      string,
      { exportValues: string[]; displayValues: string[] }
    >();
    const comboOrList = fields.filter(
      (f) =>
        f.type === PDF_FORM_FIELD_TYPE.COMBOBOX ||
        f.type === PDF_FORM_FIELD_TYPE.LISTBOX,
    );
    if (comboOrList.length === 0) return result;

    try {
      const {
        PDFDocument,
        PDFName,
        PDFArray,
        PDFString,
        PDFHexString,
        PDFDropdown,
        PDFOptionList,
      } = await import("@cantoo/pdf-lib");
      const doc = await PDFDocument.load(data, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
      });
      const form = doc.getForm();

      const decodeText = (obj: unknown): string => {
        if (obj instanceof PDFString || obj instanceof PDFHexString)
          return obj.decodeText();
        return String(obj ?? "");
      };

      for (const pf of comboOrList) {
        try {
          const field = form.getField(pf.name);
          if (
            !(field instanceof PDFDropdown) &&
            !(field instanceof PDFOptionList)
          )
            continue;

          const acroDict = (field.acroField as any).dict;
          const optRaw = acroDict.lookup(PDFName.of("Opt"));
          if (!(optRaw instanceof PDFArray)) continue;

          const exportValues: string[] = [];
          const displayValues: string[] = [];
          let hasDifference = false;

          for (let i = 0; i < optRaw.size(); i++) {
            try {
              const entry = optRaw.lookup(i);
              if (entry instanceof PDFArray && entry.size() >= 2) {
                const exp = decodeText(entry.lookup(0));
                const disp = decodeText(entry.lookup(1));
                exportValues.push(exp);
                displayValues.push(disp);
                if (exp !== disp) hasDifference = true;
              } else {
                const val = decodeText(entry);
                exportValues.push(val);
                displayValues.push(val);
              }
            } catch {
              continue;
            }
          }

          if (exportValues.length > 0) {
            result.set(pf.name, {
              exportValues,
              displayValues: hasDifference ? displayValues : exportValues,
            });
          }
        } catch {
          // Skip individual field errors
        }
      }
    } catch (e) {
      console.warn(
        "[PdfiumFormProvider] Failed to extract display options:",
        e,
      );
    }

    return result;
  }

  /**
   * Use pdf-lib to extract push button labels (/MK/CA) and actions (/A) for each button field.
   * Returns a map of fieldName → { label?, action? }.
   */
  private async extractButtonInfo(
    data: ArrayBuffer,
    fields: PdfiumFormField[],
  ): Promise<Map<string, { label?: string; action?: ButtonAction }>> {
    const result = new Map<string, { label?: string; action?: ButtonAction }>();
    const buttons = fields.filter(
      (f) => f.type === PDF_FORM_FIELD_TYPE.PUSHBUTTON,
    );
    if (buttons.length === 0) return result;

    try {
      const { PDFDocument, PDFName, PDFString, PDFHexString, PDFDict } =
        await import("@cantoo/pdf-lib");

      const doc = await PDFDocument.load(data, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
      });
      const form = doc.getForm();

      const decodeText = (obj: unknown): string | null => {
        if (obj instanceof PDFString || obj instanceof PDFHexString)
          return obj.decodeText();
        if (obj instanceof PDFName)
          return (obj as any).asString?.() ?? obj.toString().replace(/^\//, "");
        return null;
      };

      const parseActionDict = (aObj: unknown): ButtonAction | null => {
        if (!(aObj instanceof PDFDict)) return null;
        const sObj = aObj.lookup(PDFName.of("S"));
        if (!(sObj instanceof PDFName)) return null;
        const actionType: string =
          (sObj as any).asString?.() ?? sObj.toString().replace(/^\//, "");

        switch (actionType) {
          case "Named": {
            const nObj = aObj.lookup(PDFName.of("N"));
            const name =
              nObj instanceof PDFName
                ? ((nObj as any).asString?.() ??
                  nObj.toString().replace(/^\//, ""))
                : "";
            return { type: "named", namedAction: name };
          }
          case "JavaScript": {
            const jsObj = aObj.lookup(PDFName.of("JS"));
            const js = decodeText(jsObj) ?? jsObj?.toString() ?? "";
            return { type: "javascript", javascript: js };
          }
          case "SubmitForm": {
            const fObj = aObj.lookup(PDFName.of("F"));
            let url = "";
            if (fObj instanceof PDFDict) {
              url = decodeText(fObj.lookup(PDFName.of("F"))) ?? "";
            } else if (fObj) {
              url = decodeText(fObj) ?? fObj.toString();
            }
            const flagsObj = aObj.lookup(PDFName.of("Flags"));
            const flags =
              typeof (flagsObj as any)?.asNumber === "function"
                ? (flagsObj as any).asNumber()
                : 0;
            return { type: "submitForm", url, submitFlags: flags };
          }
          case "ResetForm":
            return { type: "resetForm" };
          case "URI": {
            const uriObj = aObj.lookup(PDFName.of("URI"));
            return { type: "uri", url: decodeText(uriObj) ?? "" };
          }
          default:
            return null;
        }
      };

      const getMkCaption = (dict: any): string | null => {
        try {
          const mkObj = dict.lookup(PDFName.of("MK"));
          if (!(mkObj instanceof PDFDict)) return null;
          const caObj = mkObj.lookup(PDFName.of("CA"));
          return decodeText(caObj);
        } catch {
          return null;
        }
      };

      const getActionFromDict = (dict: any): ButtonAction | null => {
        try {
          return parseActionDict(dict.lookup(PDFName.of("A")));
        } catch {
          return null;
        }
      };

      const buttonNames = new Set(buttons.map((b) => b.name));

      for (const field of form.getFields()) {
        const name = field.getName();
        if (!buttonNames.has(name)) continue;

        try {
          const acroField = (field as any).acroField;
          if (!acroField?.dict) continue;

          const info: { label?: string; action?: ButtonAction } = {};

          // Try widget dicts first (each widget can have its own /MK and /A)
          const widgets: any[] = (acroField as any).getWidgets?.() ?? [];
          for (const widget of widgets) {
            if (!info.label) {
              const label = getMkCaption(widget.dict);
              if (label) info.label = label;
            }
            if (!info.action) {
              const action = getActionFromDict(widget.dict);
              if (action) info.action = action;
            }
            if (info.label && info.action) break;
          }

          // Fall back to field-level dict
          if (!info.label) {
            const label = getMkCaption(acroField.dict);
            if (label) info.label = label;
          }
          if (!info.action) {
            const action = getActionFromDict(acroField.dict);
            if (action) info.action = action;
          }

          // Also check /AA (Additional Actions) → /U (Mouse Up) if no /A found
          if (!info.action) {
            try {
              const aaObj = acroField.dict.lookup(PDFName.of("AA"));
              if (aaObj instanceof PDFDict) {
                const uObj = aaObj.lookup(PDFName.of("U"));
                const action = parseActionDict(uObj);
                if (action) info.action = action;
              }
            } catch {
              /* non-critical */
            }
          }

          if (info.label || info.action) {
            result.set(name, info);
          }
        } catch {
          /* skip individual field errors */
        }
      }
    } catch (e) {
      console.warn("[PdfiumFormProvider] Failed to extract button info:", e);
    }

    return result;
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
