import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { ReadOnlyReason } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { WidgetAnnotation } from "@editor/tools/pdfTextEditor/model/WidgetAnnotation";

/** Why a form field's accessibility can't be changed; "unknown" for a widget the save can't address. */
export type FormFieldBlocker = ReadOnlyReason | "unknown";

/** What can be said and done about one form field widget's accessibility. */
export type FormFieldAccessibility =
  | { kind: "blocked"; blocker: FormFieldBlocker }
  | {
      kind: "editable";
      widget: WidgetAnnotation;
      /** True when an element holds it: the file's, or a Form the session gives it. */
      tagged: boolean;
      /** Its field's /TU as it will be saved. */
      description: string | null;
    };

/** The accessibility of the widget at index `position` of page `pageIndex`'s /Annots. */
export function formFieldAccessibility(
  doc: EditorDocument,
  pageIndex: number,
  position: number,
): FormFieldAccessibility {
  const structure = doc.structure(pageIndex);
  if (structure.readOnly) {
    return { kind: "blocked", blocker: structure.readOnly };
  }
  const fields = structure.formFields;
  const widget = fields.all().find((w) => w.position === position);
  if (!widget) return { kind: "blocked", blocker: "unknown" };
  return {
    kind: "editable",
    widget,
    tagged: fields.held(widget.annotation),
    description: fields.tooltip(widget.annotation),
  };
}
