/**
 * The text a form field is labelled by, found by where the page displays it:
 * the nearest one-line text beside the field on its line or just above it.
 * A guess for the user to check, as the auto-tagger's tags are.
 */
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { WidgetAnnotation } from "@editor/tools/pdfTextEditor/model/WidgetAnnotation";
import {
  ARTIFACT_TAG,
  innermostMcid,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import {
  displayBox,
  taggedMcidBeforeField,
  type DisplayBox,
} from "@editor/tools/pdfTextEditor/util/elementPlacement";

/** Points a label may sit from the field beside it, on its line. */
const MAX_BESIDE_GAP = 144;
/** Points a label may sit above the field. */
const MAX_ABOVE_GAP = 24;
/** Points of overlap still read as beside or above rather than over. */
const TOLERANCE = 2;

export interface FieldLabel {
  /** The label's text, without the blanks and colon that lead into the field. */
  text: string;
  /** The MCID of the run the label is; null when it has none. */
  mcid: number | null;
}

/**
 * The run nearest the field that ends left of it on its line, or sits above
 * it overlapping it; for a check box or radio button, also one that starts
 * right of it. Null when none is close enough. Text in a paragraph of several
 * lines, artifacts, and text drawn over the field are never labels.
 */
export function fieldLabel(
  page: Page,
  widget: WidgetAnnotation,
): FieldLabel | null {
  const field = displayBox(page, widget.rect);
  const toRight = widget.fieldType === "Btn";
  let best: { run: TextRun; text: string; gap: number } | null = null;
  for (const run of page.runs) {
    const text = labelText(run.text);
    if (!text || !mayLabel(run)) continue;
    const gap = labelGap(displayBox(page, run.bounds), field, toRight);
    if (gap !== null && (!best || gap < best.gap)) best = { run, text, gap };
  }
  return best && { text: best.text, mcid: innermostMcid(best.run.tagMarks) };
}

/**
 * The MCID of the content a new Form for the field reads after: its label's,
 * else the tagged content before it (taggedMcidBeforeField). Null when none.
 */
export function fieldAnchor(
  page: Page,
  widget: WidgetAnnotation,
): number | null {
  return (
    fieldLabel(page, widget)?.mcid ?? taggedMcidBeforeField(page, widget.rect)
  );
}

function mayLabel(run: TextRun): boolean {
  if (run.paragraphMemberPtrs.length > 1) return false;
  return !run.tagMarks.some((mark) => mark.name === ARTIFACT_TAG);
}

/** How far the run is from the field, if it is placed to label it; null when not. */
function labelGap(
  run: DisplayBox,
  field: DisplayBox,
  toRight: boolean,
): number | null {
  const onLine =
    within(middle(run.bottom, run.top), field.bottom, field.top) ||
    within(middle(field.bottom, field.top), run.bottom, run.top);
  const overColumn = run.left < field.right && run.right > field.left;
  if (onLine && run.right <= field.left + TOLERANCE) {
    return capped(field.left - run.right, MAX_BESIDE_GAP);
  }
  if (onLine && toRight && run.left >= field.right - TOLERANCE) {
    return capped(run.left - field.right, MAX_BESIDE_GAP);
  }
  if (!onLine && overColumn && run.bottom >= field.top - TOLERANCE) {
    return capped(run.bottom - field.top, MAX_ABOVE_GAP);
  }
  return null;
}

/** The run's text as a field's name: one line, without trailing blanks, dot leaders or colon. */
function labelText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[\s_]+/, "")
    .replace(/(?:[\s_:]|\.{2,})+$/, "");
}

function middle(low: number, high: number): number {
  return (low + high) / 2;
}

function within(value: number, low: number, high: number): boolean {
  return value >= low && value <= high;
}

function capped(gap: number, max: number): number | null {
  const distance = Math.max(gap, 0);
  return distance <= max ? distance : null;
}
