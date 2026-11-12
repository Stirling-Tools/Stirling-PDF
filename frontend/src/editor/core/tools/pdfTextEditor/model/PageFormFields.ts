import type { ReadOnlyReason } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { WidgetAnnotation } from "@editor/tools/pdfTextEditor/model/WidgetAnnotation";

/** A change to one of the page's widgets, for the save (see AnnotationEdit). */
export interface FormFieldEdit {
  widget: WidgetAnnotation;
  /** True when the save gives it a Form element of its own. */
  newForm: boolean;
  /** The /TU to save, null for none; absent leaves the file's. */
  tooltip?: string | null;
}

/**
 * The page's form field widgets and the session's unsaved changes to them:
 * which the session gives a Form element, and the name each field is read by.
 */
export class PageFormFields {
  private readonly widgets: ReadonlyMap<number, WidgetAnnotation>;
  private readonly tagged = new Set<number>();
  private readonly tooltips = new Map<number, string | null>();

  constructor(
    widgets: readonly WidgetAnnotation[],
    private readonly readOnly: ReadOnlyReason | null,
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

  /** The field's /TU as it will be saved: the session's, else the file's. Throws for an unknown widget. */
  tooltip(annotation: number): string | null {
    if (this.tooltips.has(annotation)) return this.tooltips.get(annotation)!;
    return this.known(annotation).tooltip;
  }

  /** Set or, with null, remove the field's /TU. Throws as setTagged does, bar the holder. */
  setTooltip(annotation: number, tooltip: string | null): void {
    const widget = this.editable(annotation);
    if (tooltip === widget.tooltip) this.tooltips.delete(annotation);
    else this.tooltips.set(annotation, tooltip);
  }

  edits(): FormFieldEdit[] {
    return this.all().flatMap((widget) => {
      const { annotation } = widget;
      const newForm = this.tagged.has(annotation);
      const named = this.tooltips.has(annotation);
      if (!newForm && !named) return [];
      return [
        {
          widget,
          newForm,
          ...(named && { tooltip: this.tooltips.get(annotation)! }),
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
