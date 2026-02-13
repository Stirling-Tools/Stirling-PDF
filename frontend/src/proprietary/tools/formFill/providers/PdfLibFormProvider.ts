/**
 * PdfLibFormProvider — Frontend-only form data provider using pdf-lib.
 *
 * Extracts form fields directly from the PDF byte stream and fills them
 * without any backend calls. This avoids sending large PDFs (potentially
 * hundreds of MB) to the server for a feature that can be done entirely
 * on the client.
 *
 * Used in normal viewer mode when the user views a PDF with form fields.
 *
 * Coordinate system:
 * pdf-lib provides widget rectangles in PDF user space (lower-left origin).
 * We transform them to CSS space (top-left origin) matching what the backend
 * FormUtils.createWidgetCoordinates() does, so the same overlay code works
 * for both providers.
 */
import { PDFDocument, PDFForm, PDFField, PDFTextField, PDFCheckBox,
  PDFDropdown, PDFRadioGroup, PDFOptionList, PDFButton, PDFSignature,
  PDFName, PDFDict, PDFArray, PDFNumber, PDFRef, PDFPage,
  PDFString, PDFHexString } from '@cantoo/pdf-lib';
import type { FormField, FormFieldType, WidgetCoordinates } from '@proprietary/tools/formFill/types';
import type { IFormDataProvider } from '@proprietary/tools/formFill/providers/types';

/**
 * Read a File/Blob as ArrayBuffer.
 */
async function readAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

/**
 * Get the page index for a widget annotation by finding which page contains it.
 */
function getWidgetPageIndex(
  widget: PDFDict,
  pages: PDFPage[],
): number {
  // Check /P entry first (direct page reference)
  const pRef = widget.get(PDFName.of('P'));
  if (pRef instanceof PDFRef) {
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].ref === pRef) return i;
    }
  }

  // Fall back to scanning each page's /Annots array
  const widgetRef = findWidgetRef(widget, pages);
  if (widgetRef !== undefined) return widgetRef;

  return 0; // default to first page
}

function findWidgetRef(widget: PDFDict, pages: PDFPage[]): number | undefined {
  for (let i = 0; i < pages.length; i++) {
    const annots = pages[i].node.lookup(PDFName.of('Annots'));
    if (annots instanceof PDFArray) {
      for (let j = 0; j < annots.size(); j++) {
        const annotRef = annots.get(j);
        const annotDict = annots.lookup(j);
        if (annotDict === widget || annotRef === (widget as any).ref) {
          return i;
        }
      }
    }
  }
  return undefined;
}

/**
 * Get the page rotation in degrees (0, 90, 180, 270).
 */
function getPageRotation(page: PDFPage): number {
  const rot = page.getRotation();
  return rot?.angle ?? 0;
}

/**
 * Extract widget rectangles from a PDFField, transforming from PDF space
 * (lower-left origin) to CSS space (top-left origin).
 *
 * Widget /Rect coordinates are always in un-rotated PDF user space
 * (defined by the MediaBox/CropBox). We only need a y-flip to convert
 * from PDF's lower-left origin to CSS's upper-left origin.
 *
 * The embedpdf viewer wraps all page content (including this overlay)
 * inside a <Rotate> CSS component that handles visual rotation.
 * Therefore we must NOT apply any rotation here — doing so would
 * double-rotate the widgets.
 */
function extractWidgets(
  field: PDFField,
  pages: PDFPage[],
  _doc: PDFDocument,
): WidgetCoordinates[] {
  const widgets: WidgetCoordinates[] = [];
  // Access the underlying PDFDict from the acro field
  const acroFieldDict = (field.acroField as any).dict as PDFDict;

  // Get all widget annotations for this field
  const widgetDicts = getFieldWidgets(acroFieldDict);

  for (const wDict of widgetDicts) {
    const rect = wDict.lookup(PDFName.of('Rect'));
    if (!(rect instanceof PDFArray) || rect.size() < 4) continue;

    const x1 = numberVal(rect.lookup(0));
    const y1 = numberVal(rect.lookup(1));
    const x2 = numberVal(rect.lookup(2));
    const y2 = numberVal(rect.lookup(3));

    const pageIndex = getWidgetPageIndex(wDict, pages);
    const page = pages[pageIndex];
    if (!page) continue;

    // Get CropBox dimensions (un-rotated) for coordinate transformation
    const cropBox = getCropBox(page);
    const cropHeight = cropBox.height;
    const cropX = cropBox.x;
    const cropY = cropBox.y;

    // Widget rect in PDF space (lower-left origin, un-rotated)
    const pdfX = Math.min(x1, x2);
    const pdfY = Math.min(y1, y2);
    const pdfW = Math.abs(x2 - x1);
    const pdfH = Math.abs(y2 - y1);

    // Adjust relative to CropBox origin
    const relativeX = pdfX - cropX;
    const relativeY = pdfY - cropY;

    // Convert from PDF lower-left origin to CSS upper-left origin (y-flip).
    // No rotation transform here — the <Rotate> CSS component in the viewer
    // handles page rotation for all overlays including form fields.
    const finalX = relativeX;
    const finalY = cropHeight - relativeY - pdfH;
    const finalW = pdfW;
    const finalH = pdfH;

    // Extract export value for checkboxes/radios
    let exportValue: string | undefined;
    const ap = wDict.lookup(PDFName.of('AP'));
    if (ap instanceof PDFDict) {
      const normal = ap.lookup(PDFName.of('N'));
      if (normal instanceof PDFDict) {
        // The keys of /N (other than /Off) are the export values.
        // PDFDict.entries() reliably returns [PDFName, PDFObject][] in
        // @cantoo/pdf-lib — no optional chaining needed.
        try {
          const entries = normal.entries();
          const keys = entries
            .map(([k]) => k.decodeText())
            .filter((k) => k !== 'Off');
          if (keys.length > 0) exportValue = keys[0];
        } catch {
          // Malformed AP dict — skip export value extraction
        }
      }
    }
    // Also check /AS for current appearance state
    if (!exportValue) {
      const asEntry = wDict.lookup(PDFName.of('AS'));
      if (asEntry instanceof PDFName) {
        const asVal = asEntry.decodeText();
        if (asVal !== 'Off') exportValue = asVal;
      }
    }

    // Extract font size from default appearance string
    let fontSize: number | undefined;
    const da = wDict.lookup(PDFName.of('DA'));
    if (da) {
      const daStr = da.toString();
      const tfMatch = daStr.match(/(\d+(?:\.\d+)?)\s+Tf/);
      if (tfMatch) {
        fontSize = parseFloat(tfMatch[1]);
        if (fontSize === 0) fontSize = undefined; // 0 means auto-size
      }
    }

    widgets.push({
      pageIndex,
      x: finalX,
      y: finalY,
      width: finalW,
      height: finalH,
      exportValue,
      fontSize,
    });
  }

  return widgets;
}

function numberVal(obj: any): number {
  if (obj instanceof PDFNumber) return obj.asNumber();
  if (typeof obj === 'number') return obj;
  return 0;
}

/**
 * Get the CropBox (or MediaBox fallback) dimensions in un-rotated PDF space.
 * These are the raw dictionary values without any rotation adjustment.
 */
function getCropBox(page: PDFPage): { x: number; y: number; width: number; height: number } {
  // Check direct CropBox entry
  const cropBox = page.node.lookup(PDFName.of('CropBox'));
  if (cropBox instanceof PDFArray && cropBox.size() >= 4) {
    return {
      x: numberVal(cropBox.lookup(0)),
      y: numberVal(cropBox.lookup(1)),
      width: numberVal(cropBox.lookup(2)) - numberVal(cropBox.lookup(0)),
      height: numberVal(cropBox.lookup(3)) - numberVal(cropBox.lookup(1)),
    };
  }
  // Check direct MediaBox entry
  const mediaBox = page.node.lookup(PDFName.of('MediaBox'));
  if (mediaBox instanceof PDFArray && mediaBox.size() >= 4) {
    return {
      x: numberVal(mediaBox.lookup(0)),
      y: numberVal(mediaBox.lookup(1)),
      width: numberVal(mediaBox.lookup(2)) - numberVal(mediaBox.lookup(0)),
      height: numberVal(mediaBox.lookup(3)) - numberVal(mediaBox.lookup(1)),
    };
  }
  // Traverse parent page-tree nodes for inherited MediaBox
  let node: any = page.node;
  while (node) {
    const parentNode = node.lookup(PDFName.of('Parent'));
    if (parentNode instanceof PDFDict) {
      const inheritedBox = parentNode.lookup(PDFName.of('MediaBox'));
      if (inheritedBox instanceof PDFArray && inheritedBox.size() >= 4) {
        return {
          x: numberVal(inheritedBox.lookup(0)),
          y: numberVal(inheritedBox.lookup(1)),
          width: numberVal(inheritedBox.lookup(2)) - numberVal(inheritedBox.lookup(0)),
          height: numberVal(inheritedBox.lookup(3)) - numberVal(inheritedBox.lookup(1)),
        };
      }
      node = parentNode;
    } else {
      break;
    }
  }
  // Last resort: use page.getSize() but un-rotate the dimensions
  const { width, height } = page.getSize();
  const rotation = getPageRotation(page);
  if (rotation === 90 || rotation === 270) {
    return { x: 0, y: 0, width: height, height: width };
  }
  return { x: 0, y: 0, width, height };
}

/**
 * Get the widget annotation dictionaries for a field.
 * A field can either BE a widget (merged) or have child /Kids that are widgets.
 */
function getFieldWidgets(acroField: PDFDict): PDFDict[] {
  const kids = acroField.lookup(PDFName.of('Kids'));
  if (kids instanceof PDFArray) {
    const result: PDFDict[] = [];
    for (let i = 0; i < kids.size(); i++) {
      const kid = kids.lookup(i);
      if (kid instanceof PDFDict) {
        // Check if this kid is a widget (has /Rect) vs another field node
        const subtype = kid.lookup(PDFName.of('Subtype'));
        if (subtype instanceof PDFName && subtype.decodeText() === 'Widget') {
          result.push(kid);
        } else if (kid.lookup(PDFName.of('Rect'))) {
          // Merged field/widget — has Rect but maybe no explicit Subtype
          result.push(kid);
        } else {
          // Intermediate field node — recurse
          result.push(...getFieldWidgets(kid));
        }
      }
    }
    return result;
  }

  // No Kids — the field dict itself is the widget (merged field/widget)
  if (acroField.lookup(PDFName.of('Rect'))) {
    return [acroField];
  }
  return [];
}

/**
 * Determine the FormFieldType from a pdf-lib PDFField.
 */
function getFieldType(field: PDFField): FormFieldType {
  if (field instanceof PDFTextField) return 'text';
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFDropdown) return 'combobox';
  if (field instanceof PDFRadioGroup) return 'radio';
  if (field instanceof PDFOptionList) return 'listbox';
  if (field instanceof PDFButton) return 'button';
  if (field instanceof PDFSignature) return 'signature';
  return 'text';
}

/**
 * Get the current value of a field as a string.
 */
function getFieldValue(field: PDFField): string {
  try {
    if (field instanceof PDFTextField) {
      return field.getText() ?? '';
    }
    if (field instanceof PDFCheckBox) {
      return field.isChecked() ? 'Yes' : 'Off';
    }
    if (field instanceof PDFDropdown) {
      const selected = field.getSelected();
      return selected.length > 0 ? selected[0] : '';
    }
    if (field instanceof PDFRadioGroup) {
      return getRadioValue(field);
    }
    if (field instanceof PDFOptionList) {
      const selected = field.getSelected();
      return selected.join(',');
    }
  } catch {
    // Some fields may throw on getValue if malformed
  }
  return '';
}

function getRadioValue(field: PDFRadioGroup): string {
  const selected = field.getSelected() ?? '';
  if (!selected || selected === 'Off') return selected;

  const options = field.getOptions();

  if (options.includes(selected)) return selected;

  const mappedOption = mapAppearanceStateToOption(field, selected, options);
  if (mappedOption) return mappedOption;

  const index = parseInt(selected, 10);
  if (!isNaN(index) && index >= 0 && index < options.length) {
    return options[index];
  }

  return selected;
}

function mapAppearanceStateToOption(
  field: PDFRadioGroup,
  stateName: string,
  options: string[],
): string | undefined {
  try {
    const acroFieldDict = (field.acroField as any).dict as PDFDict;
    const widgets = getFieldWidgets(acroFieldDict);

    for (let i = 0; i < widgets.length; i++) {
      const ap = widgets[i].lookup(PDFName.of('AP'));
      if (!(ap instanceof PDFDict)) continue;

      const normal = ap.lookup(PDFName.of('N'));
      if (!(normal instanceof PDFDict)) continue;

      let keys: string[] = [];
      try {
        keys = normal.entries().map(([k]) => k.decodeText());
      } catch {
        continue;
      }
      if (keys.includes(stateName) && i < options.length) {
        return options[i];
      }
    }
  } catch {
    // Fallback handled by caller
  }
  return undefined;
}

function resolveRadioValueForSelect(
  field: PDFRadioGroup,
  value: string,
): string | null {
  const options = field.getOptions();

  if (options.includes(value)) return value;

  const mappedOption = mapAppearanceStateToOption(field, value, options);
  if (mappedOption) return mappedOption;

  const index = parseInt(value, 10);
  if (!isNaN(index) && index >= 0 && index < options.length) {
    return options[index];
  }

  const lower = value.toLowerCase();
  const match = options.find((o: string) => o.toLowerCase() === lower);
  if (match) return match;

  return null;
}

/**
 * Get field options (for dropdowns, listboxes, radios).
 */
function getFieldOptions(field: PDFField): string[] | null {
  try {
    if (field instanceof PDFDropdown) {
      return field.getOptions();
    }
    if (field instanceof PDFOptionList) {
      return field.getOptions();
    }
    if (field instanceof PDFRadioGroup) {
      return field.getOptions();
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Extract display labels from the /Opt array if it contains [export, display]
 * pairs.  PDF spec §12.7.4.4: each element of /Opt may be either a text
 * string (export value == display value) or a two-element array where the
 * first element is the export value and the second is the display text.
 *
 * Returns null when every display value equals its export value (no distinct
 * display labels exist), keeping the interface lean for the common case.
 */
function getFieldDisplayOptions(field: PDFField): string[] | null {
  if (!(field instanceof PDFDropdown) && !(field instanceof PDFOptionList)) {
    return null;
  }

  try {
    const acroDict = (field.acroField as any).dict as PDFDict;
    const optRaw = acroDict.lookup(PDFName.of('Opt'));
    if (!(optRaw instanceof PDFArray)) return null;

    const exports: string[] = [];
    const displays: string[] = [];
    let hasDifference = false;

    for (let i = 0; i < optRaw.size(); i++) {
      try {
        const entry = optRaw.lookup(i);

        if (entry instanceof PDFArray && entry.size() >= 2) {
          // [exportValue, displayValue] pair
          const exp = decodeText(entry.lookup(0));
          const disp = decodeText(entry.lookup(1));
          exports.push(exp);
          displays.push(disp);
          if (exp !== disp) hasDifference = true;
        } else {
          // Plain string — export and display are the same
          const val = decodeText(entry);
          exports.push(val);
          displays.push(val);
        }
      } catch {
        // Malformed /Opt entry — skip but continue processing remaining entries
        continue;
      }
    }

    if (displays.length === 0) return null;
    return hasDifference ? displays : null;
  } catch {
    return null;
  }
}

/** Decode a PDFString, PDFHexString, or PDFName to a JS string. */
function decodeText(obj: unknown): string {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    return obj.decodeText();
  }
  if (obj instanceof PDFName) {
    return obj.decodeText();
  }
  if (typeof obj === 'string') return obj;
  return String(obj ?? '');
}

/**
 * Check if a field is read-only.
 */
function isFieldReadOnly(field: PDFField): boolean {
  try {
    return field.isReadOnly();
  } catch {
    return false;
  }
}

/**
 * Check if a field is required.
 */
function isFieldRequired(field: PDFField): boolean {
  try {
    return field.isRequired();
  } catch {
    return false;
  }
}

/**
 * Get field tooltip (TU entry).
 * Uses proper PDFString/PDFHexString decoding for correct Unicode support.
 */
function getFieldTooltip(acroField: PDFDict): string | null {
  const tu = acroField.lookup(PDFName.of('TU'));
  if (!tu) return null;

  try {
    // Prefer decodeText() for proper Unicode handling (UTF-16BE / PDFDocEncoding)
    if (tu instanceof PDFString || tu instanceof PDFHexString) {
      return tu.decodeText();
    }
    // Fallback: strip parentheses from raw toString() for other object types
    return tu.toString().replace(/^\(|\)$/g, '');
  } catch {
    return null;
  }
}

/**
 * Check if a text field is multiline (flag bit 13 set in /Ff).
 */
function isMultiline(field: PDFField): boolean {
  if (!(field instanceof PDFTextField)) return false;
  try {
    return field.isMultiline();
  } catch {
    return false;
  }
}

/**
 * Get the label for a field — use the partial name or the full qualified name.
 */
function getFieldLabel(field: PDFField): string {
  const name = field.getName();
  // Use the last segment of the qualified name as the label
  const parts = name.split('.');
  return parts[parts.length - 1] || name;
}

export class PdfLibFormProvider implements IFormDataProvider {
  readonly name = 'pdf-lib';

  async fetchFields(file: File | Blob): Promise<FormField[]> {
    const arrayBuffer = await readAsArrayBuffer(file);
    let doc: PDFDocument;
    try {
      doc = await PDFDocument.load(arrayBuffer, {
        ignoreEncryption: true,
        updateMetadata: false,
        throwOnInvalidObject: false,
      });
    } catch (loadError) {
      console.warn('[PdfLibFormProvider] Failed to load PDF document:', loadError);
      return [];
    }

    let form: PDFForm;
    try {
      form = doc.getForm();
    } catch (formError) {
      // No AcroForm or broken catalog — return empty
      console.warn('[PdfLibFormProvider] Failed to access AcroForm:', formError);
      return [];
    }

    let fields: PDFField[];
    try {
      fields = form.getFields();
    } catch (fieldsError) {
      console.warn('[PdfLibFormProvider] Failed to enumerate form fields:', fieldsError);
      return [];
    }
    if (fields.length === 0) return [];

    let pages: PDFPage[];
    try {
      pages = doc.getPages();
    } catch (pagesError) {
      // Pages tree is invalid (same issue as usePdfLibLinks "invalid catalog").
      // Without page references we can't place widgets, so return empty.
      // The viewer will fall back to native form rendering via withForms.
      console.warn(
        '[PdfLibFormProvider] PDF pages tree is invalid — cannot place form widgets.',
        'Native form rendering will be used as fallback.',
        pagesError,
      );
      return [];
    }

    const result: FormField[] = [];

    for (const field of fields) {
      try {
        const type = getFieldType(field);
        const widgets = extractWidgets(field, pages, doc);

        // Skip fields with no visible widgets
        if (widgets.length === 0) continue;

        const formField: FormField = {
          name: field.getName(),
          label: getFieldLabel(field),
          type,
          value: getFieldValue(field),
          options: getFieldOptions(field),
          displayOptions: getFieldDisplayOptions(field),
          required: isFieldRequired(field),
          readOnly: isFieldReadOnly(field),
          multiSelect: field instanceof PDFOptionList,
          multiline: isMultiline(field),
          tooltip: getFieldTooltip((field.acroField as any).dict as PDFDict),
          widgets,
        };

        result.push(formField);
      } catch (fieldError) {
        // Skip individual malformed fields but continue processing
        console.warn(`[PdfLibFormProvider] Skipping field "${field.getName()}":`, fieldError);
      }
    }

    return result;
  }

  async fillForm(
    file: File | Blob,
    values: Record<string, string>,
    flatten: boolean,
  ): Promise<Blob> {
    const arrayBuffer = await readAsArrayBuffer(file);
    const doc = await PDFDocument.load(arrayBuffer, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });

    const form = doc.getForm();
    const fields = form.getFields();

    for (const field of fields) {
      const fieldName = field.getName();
      if (!(fieldName in values)) continue;

      const value = values[fieldName];

      try {
        if (field instanceof PDFTextField) {
          field.setText(value || undefined);
        } else if (field instanceof PDFCheckBox) {
          if (value && value !== 'Off') {
            field.check();
          } else {
            field.uncheck();
          }
        } else if (field instanceof PDFDropdown) {
          if (value) {
            field.select(value);
          } else {
            field.clear();
          }
        } else if (field instanceof PDFRadioGroup) {
          if (value && value !== 'Off') {
            const resolved = resolveRadioValueForSelect(field, value);
            if (resolved) {
              field.select(resolved);
            } else {
              console.warn(
                `[PdfLibFormProvider] Radio value "${value}" could not be mapped to options [${field.getOptions().join(', ')}] for field "${fieldName}"`,
              );
            }
          }
        } else if (field instanceof PDFOptionList) {
          if (value) {
            const vals = value.split(',').filter(Boolean);
            field.select(vals[0]); // PDFOptionList.select takes single value
          } else {
            field.clear();
          }
        }
      } catch (err) {
        console.warn(`[PdfLibFormProvider] Failed to set value for field "${fieldName}":`, err);
      }
    }

    if (flatten) {
      form.flatten();
    }

    const pdfBytes = await doc.save();
    return new Blob([pdfBytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
  }
}
