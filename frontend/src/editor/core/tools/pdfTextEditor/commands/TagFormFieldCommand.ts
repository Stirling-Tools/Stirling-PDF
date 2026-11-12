import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { WidgetAnnotation } from "@editor/tools/pdfTextEditor/model/WidgetAnnotation";
import { fieldLabel } from "@editor/tools/pdfTextEditor/util/formLabel";

/**
 * Give form field widget `annotation` a Form element of its own. A field with
 * no /TU is named by its label (fieldLabel), where it has one. The page must
 * already be read.
 */
export class TagFormFieldCommand implements Command {
  readonly type = "tag-form-field";
  private readonly pageIndex: number;
  private readonly annotation: number;
  /** Found on first apply, so a redo names the field the same. */
  private label: string | null | undefined;
  private named = false;

  constructor(opts: { pageIndex: number; annotation: number }) {
    this.pageIndex = opts.pageIndex;
    this.annotation = opts.annotation;
  }

  apply(doc: EditorDocument): void {
    const fields = doc.structure(this.pageIndex).formFields;
    const widget = taggableFormFields(doc, this.pageIndex).find(
      (w) => w.annotation === this.annotation,
    );
    if (!widget) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotTagFormField",
            "This form field can't be tagged.",
          ),
        ),
      );
    }
    if (this.label === undefined) {
      this.label = fieldLabel(doc.page(this.pageIndex), widget)?.text ?? null;
    }
    fields.setTagged(this.annotation, true);
    this.named =
      this.label !== null && fields.tooltip(this.annotation) === null;
    if (this.named) fields.setTooltip(this.annotation, this.label);
    doc.page(this.pageIndex).bumpRevision();
  }

  revert(doc: EditorDocument): void {
    const fields = doc.structure(this.pageIndex).formFields;
    if (this.named) fields.setTooltip(this.annotation, null);
    fields.setTagged(this.annotation, false);
    doc.page(this.pageIndex).bumpRevision();
  }

  describe(): string {
    return i18n.t("pdfTextEditor.commands.tagFormField", "Tag form field");
  }
}

/** The page's form fields TagFormFieldCommand can tag: those no element holds, on a page whose save can write them. */
export function taggableFormFields(
  doc: EditorDocument,
  pageIndex: number,
): WidgetAnnotation[] {
  const structure = doc.structure(pageIndex);
  if (structure.readOnly) return [];
  const fields = structure.formFields;
  return fields.all().filter((w) => !fields.held(w.annotation));
}
