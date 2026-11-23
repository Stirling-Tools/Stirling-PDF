import type { ReadOnlyReason } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { WidgetAnnotation } from "@editor/tools/pdfTextEditor/model/WidgetAnnotation";

/** A change to one of the page's widgets, for the save (see AnnotationEdit). */
export interface FormFieldEdit {
  widget: WidgetAnnotation;
  /** True when the save gives it a Form element of its own. */
  newForm: boolean;
  /** The /TU to save on its field, null for none; absent leaves the file's. */
  tooltip?: string | null;
}

/**
 * The session's /TU edits, by field object number. One per document, shared
 * by every page's PageFormFields, so all the widgets of a field show and save
 * one name.
 */
export type FieldTooltips = Map<number, string | null>;

/**
 * The page's form field widgets and the session's unsaved changes to them:
 * which the session gives a Form element, and the name each field is read by.
 */
export class PageFormFields {
  private readonly widgets: ReadonlyMap<number, WidgetAnnotation>;
  private readonly tagged = new Set<number>();

  constructor(
    widgets: readonly WidgetAnnotation[],
    private readonly readOnly: ReadOnlyReason | null,
    private readonly tooltips: FieldTooltips = new Map(),
  ) {
    this.widgets = new Map(widgets.map((w) => [w.annotation, w]));
  }

  all(): WidgetAnnotation[] {
    return [...this.widgets.values()];
  }

  /** True when an element holds the widget: the file's, or a Form the session gives it. */
  held(annotation: number): boolean {
    return (
      this.known(annotation).holder !== null || this.tagged.has(annotation)
    );
  }

  /**
   * Give the widget a Form element of its own, or take it back with false.
   * Throws for a page whose save cannot write it, a widget the page does not
   * have, and one the file already gives an element.
   */
  setTagged(annotation: number, tagged: boolean): void {
    if (this.editable(annotation).holder !== null) {
      throw new Error(`Widget ${annotation} already has an element`);
    }
    if (tagged) this.tagged.add(annotation);
    else this.tagged.delete(annotation);
  }

  /** The /TU of the widget's field as it will be saved: the session's, else the file's. Throws for an unknown widget. */
  tooltip(annotation: number): string | null {
    const { field, tooltip } = this.known(annotation);
    return this.tooltips.has(field) ? this.tooltips.get(field)! : tooltip;
  }

  /** Set or, with null, remove the /TU of the widget's field. Throws as setTagged does, bar the holder. */
  setTooltip(annotation: number, tooltip: string | null): void {
    const widget = this.editable(annotation);
    if (tooltip === widget.tooltip) this.tooltips.delete(widget.field);
    else this.tooltips.set(widget.field, tooltip);
  }

  /** Each widget of a renamed field carries the name: the caller saves it once per field. */
  edits(): FormFieldEdit[] {
    return this.all().flatMap((widget) => {
      const newForm = this.tagged.has(widget.annotation);
      const named = this.tooltips.has(widget.field);
      if (!newForm && !named) return [];
      return [
        {
          widget,
          newForm,
          ...(named && { tooltip: this.tooltips.get(widget.field)! }),
        },
      ];
    });
  }

  private editable(annotation: number): WidgetAnnotation {
    if (this.readOnly) throw new Error(`The page is ${this.readOnly}`);
    return this.known(annotation);
  }

  private known(annotation: number): WidgetAnnotation {
    const widget = this.widgets.get(annotation);
    if (!widget) throw new Error(`No widget ${annotation} on the page`);
    return widget;
  }
}
