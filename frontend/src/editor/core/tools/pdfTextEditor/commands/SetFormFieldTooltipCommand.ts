import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

/**
 * Set or, with null, remove the /TU of the field form field widget
 * `annotation` belongs to: the name a screen reader gives the field. Touches
 * no page content; the save pass writes it.
 */
export class SetFormFieldTooltipCommand implements Command {
  readonly type = "set-form-field-tooltip";
  private readonly pageIndex: number;
  private readonly annotation: number;
  private readonly tooltip: string | null;
  /** The /TU before the first apply. */
  private previous: string | null | undefined;

  constructor(opts: {
    pageIndex: number;
    annotation: number;
    tooltip: string | null;
  }) {
    this.pageIndex = opts.pageIndex;
    this.annotation = opts.annotation;
    this.tooltip = opts.tooltip;
  }

  apply(doc: EditorDocument): void {
    const structure = doc.structure(this.pageIndex);
    const fields = structure.formFields;
    const known = fields.all().some((w) => w.annotation === this.annotation);
    if (structure.readOnly || !known) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotDescribeFormField",
            "This form field's description can't be changed.",
          ),
        ),
      );
    }
    if (this.previous === undefined) {
      this.previous = fields.tooltip(this.annotation);
    }
    fields.setTooltip(this.annotation, this.tooltip);
    doc.page(this.pageIndex).bumpRevision();
  }

  revert(doc: EditorDocument): void {
    if (this.previous === undefined) return;
    doc
      .structure(this.pageIndex)
      .formFields.setTooltip(this.annotation, this.previous);
    doc.page(this.pageIndex).bumpRevision();
  }

  /** Keystrokes in one field's description collapse into one undo step. */
  coalesceKey(): string {
    return `set-form-field-tooltip:${this.pageIndex}:${this.annotation}`;
  }
}
