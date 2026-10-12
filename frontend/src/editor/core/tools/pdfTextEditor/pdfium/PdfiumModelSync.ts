import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import { PdfiumTextReader } from "@app/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import type { GroupingMode } from "@app/tools/pdfTextEditor/types";

// Re-read a page from PDFium and fold the result onto the EXISTING run objects
// instead of replacing them.
//
// `PdfiumTextReader.populate` mints fresh `TextRun`s with fresh ids, so calling
// it after a commit would invalidate every id the selection, the undo stack and
// React's keys are holding - which is exactly why the model is hand-patched by
// each command today. Matching the re-read runs back onto the live ones by
// PDFium object pointer keeps identity stable, so the engine can be the source
// of truth for geometry without anything downstream noticing.

/** Every PDFium pointer that backs a run, in the order the reader emits them. */
function memberPtrsOf(run: TextRun): number[] {
  if (run.paragraphLeafPtrs.length > 0) return run.paragraphLeafPtrs;
  if (run.mergedFromPtrs.length > 0) return run.mergedFromPtrs;
  return run.pdfiumObjPtr ? [run.pdfiumObjPtr] : [];
}

// Engine-owned geometry. Text and font identity stay with the model.
//
// Deliberately positions ONLY, not bounds or the matrix. This refresh fires
// 600ms after the last keystroke, which is usually still mid-edit, so adopting
// the engine's box would resize the field under the user's caret - and would
// also overwrite the deliberate "focused box grows past its text so the caret
// has room" behaviour. Bounds adoption becomes safe once the overlay is
// destroyed on blur (issue 3c), which is why the doc orders 3a -> 3b -> 3c.
function adoptGeometry(target: TextRun, fresh: TextRun): boolean {
  // Pen positions are what the overlay paints against. Only adopt them when
  // they describe the SAME string, or the overlay would lay this run's glyphs
  // out against another text's advances.
  if (fresh.charPositionsKey !== target.positionsKey()) return false;
  target.charStartsX = fresh.charStartsX;
  target.charEndsX = fresh.charEndsX;
  target.charPositionsKey = fresh.charPositionsKey;
  target.charSpacingPt = fresh.charSpacingPt;
  return true;
}

export interface ModelSyncResult {
  /** True when any live run's geometry actually moved. */
  changed: boolean;
  matched: number;
  /** Live runs the re-read no longer sees (their objects went away). */
  unmatched: number;
  /** Runs the re-read found that the model has no id for. */
  appeared: number;
}

export class PdfiumModelSync {
  // Re-read `page` and mutate its existing runs in place. Runs are matched by
  // shared PDFium object pointers, so ids survive.
  static resyncPage(
    doc: EditorDocument,
    page: Page,
    mode: GroupingMode,
  ): ModelSyncResult {
    const result: ModelSyncResult = {
      changed: false,
      matched: 0,
      unmatched: 0,
      appeared: 0,
    };
    if (!page.loaded || page.runs.length === 0) return result;

    // Push pending object edits into the content stream first: the text page
    // the reader opens is built from the CURRENT stream.
    page.flushGenerate(doc.module);

    // Read into a scratch page so a failure leaves the live model untouched.
    const scratch = new Page({
      index: page.index,
      pagePtr: page.pagePtr,
      width: page.width,
      height: page.height,
      display: page.display,
    });
    try {
      PdfiumTextReader.populate(doc, scratch, mode);
    } catch {
      return result;
    }
    if (scratch.runs.length === 0) return result;

    // Index the live runs by every pointer that backs them.
    const liveByPtr = new Map<number, TextRun>();
    for (const run of page.runs) {
      for (const ptr of memberPtrsOf(run)) {
        if (ptr && !liveByPtr.has(ptr)) liveByPtr.set(ptr, run);
      }
    }

    // A fresh run belongs to whichever live run it shares the most pointers
    // with: grouping can split or merge, so a single shared pointer is not
    // enough to claim identity.
    const claimed = new Set<TextRun>();
    for (const fresh of scratch.runs) {
      const votes = new Map<TextRun, number>();
      for (const ptr of memberPtrsOf(fresh)) {
        const live = liveByPtr.get(ptr);
        if (live) votes.set(live, (votes.get(live) ?? 0) + 1);
      }
      let best: TextRun | null = null;
      let bestVotes = 0;
      for (const [live, count] of votes) {
        if (count > bestVotes && !claimed.has(live)) {
          best = live;
          bestVotes = count;
        }
      }
      if (!best) {
        result.appeared += 1;
        continue;
      }
      claimed.add(best);
      result.matched += 1;
      if (adoptGeometry(best, fresh)) result.changed = true;
    }
    result.unmatched = page.runs.length - claimed.size;
    return result;
  }
}
