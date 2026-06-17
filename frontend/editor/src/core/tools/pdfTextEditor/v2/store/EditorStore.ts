import { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { HistoryStack } from "@app/tools/pdfTextEditor/v2/store/HistoryStack";
import { Selection } from "@app/tools/pdfTextEditor/v2/store/Selection";
import { PdfiumTextReader } from "@app/tools/pdfTextEditor/v2/pdfium/PdfiumTextReader";
import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type {
  GroupingMode,
  PageSnapshot,
  WidthMode,
} from "@app/tools/pdfTextEditor/v2/types";

export type InteractionMode = "select" | "addText";

export interface LoadProgress {
  /** Stage description shown in the loader: "Reading file", "Parsing PDF", "Loading page 3/60", etc. */
  stage: string;
  /** Completed work units (e.g. pages loaded). */
  current: number;
  /** Total work units (e.g. total pages). 0 when unknown. */
  total: number;
}

export interface EditorViewState {
  hasDocument: boolean;
  pageCount: number;
  pages: PageSnapshot[];
  /** Document-level dirty bit (any page dirty). */
  dirty: boolean;
  /** Async lifecycle markers. */
  loading: boolean;
  /** True once the first page's bitmap has actually painted in PageView. */
  firstPageRendered: boolean;
  /** Detailed progress for the loading state. */
  progress: LoadProgress | null;
  error: string | null;
  /** Pixel scale at which previews are rendered. */
  renderScale: number;
  /** What clicks on the page area do. */
  mode: InteractionMode;
  /** How the reader clusters source text into editable runs. */
  groupingMode: GroupingMode;
  /**
   * How an editable text box resizes as the user types more than fits:
   *  - "grow": the box widens to the right, never wrapping (default).
   *  - "wrap": the box width is locked to the source width; text word-
   *    wraps and the box grows downward instead.
   */
  widthMode: WidthMode;
}

const INITIAL: EditorViewState = {
  hasDocument: false,
  pageCount: 0,
  pages: [],
  dirty: false,
  loading: false,
  firstPageRendered: false,
  progress: null,
  error: null,
  renderScale: 1.5,
  mode: "select",
  groupingMode: "auto",
  widthMode: "grow",
};

/**
 * Single observable store for the editor's React layer.
 *
 * Subscribers get a stable `EditorViewState` snapshot every time something
 * relevant changes. The store owns the document, the history stack, and the
 * selection. Components never reach into PDFium directly - they dispatch
 * commands.
 */
export class EditorStore {
  readonly history: HistoryStack;
  readonly selection: Selection;
  private doc: EditorDocument | null;
  private state: EditorViewState;
  private listeners: Set<(s: EditorViewState) => void>;
  /** Undo-stack depth at the last save; the doc is dirty when it differs. */
  private savedUndoDepth = 0;
  /** True when edits were baked into the stream (e.g. grouping-mode switch). */
  private bakedDirty = false;
  /** Monotonic token so a superseded async load can detect it lost the race. */
  private loadToken = 0;

  constructor() {
    this.history = new HistoryStack();
    this.selection = new Selection();
    this.doc = null;
    this.state = INITIAL;
    this.listeners = new Set();
  }

  get document(): EditorDocument | null {
    return this.doc;
  }

  getState(): EditorViewState {
    return this.state;
  }

  subscribe(listener: (s: EditorViewState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setLoading(loading: boolean): void {
    // Starting a load clears any stale error. Finishing must NOT touch error:
    // a failed load sets it in its catch, then the finally calls
    // setLoading(false), which previously reset error to null - silently
    // swallowing every load failure (encrypted/corrupted PDFs).
    if (loading) {
      this.patch({ loading: true, error: null });
    } else {
      this.patch({ loading: false, progress: null });
    }
  }

  setProgress(progress: LoadProgress | null): void {
    this.patch({ progress });
  }

  markFirstPageRendered(): void {
    if (this.state.firstPageRendered) return;
    this.patch({ firstPageRendered: true });
  }

  setError(error: string | null): void {
    this.patch({ error, loading: false });
  }

  setRenderScale(scale: number): void {
    this.patch({ renderScale: scale });
  }

  setMode(mode: InteractionMode): void {
    this.patch({ mode });
  }

  setWidthMode(widthMode: WidthMode): void {
    this.patch({ widthMode });
  }

  get groupingMode(): GroupingMode {
    return this.state.groupingMode;
  }

  /**
   * Switch how source text is clustered into runs (Auto = detect
   * paragraphs, Line = one run per source line).
   *
   * Re-reads every loaded page under the new mode. Committed edits are
   * baked into the PDFium content stream, so they survive the re-read;
   * but the in-memory run model (and its run IDs) is rebuilt from
   * scratch, so the undo history can no longer target the old runs - it
   * is cleared. Lazy (unread) pages pick up the new mode when they're
   * first scrolled into view via `ensurePageRead`.
   */
  setGroupingMode(mode: GroupingMode): void {
    if (this.state.groupingMode === mode) return;
    const doc = this.doc;
    if (!doc) {
      this.patch({ groupingMode: mode });
      return;
    }
    // Re-reading rebuilds run IDs, so the undo history can't survive the
    // switch and is cleared. Any unsaved edits are baked into the stream
    // here, so remember the doc stays dirty even though the stack is empty.
    const wasDirty = this.isDirty();
    for (const page of doc.loadedPages()) {
      if (!page.loaded) continue;
      // Flush deferred edits into the content stream before re-reading
      // so the rebuilt runs reflect the user's current edits.
      page.flushGenerate(doc.module);
      page.loaded = false;
      page.setRuns([]);
      page.setImages([]);
      PdfiumTextReader.populate(doc, page, mode);
    }
    this.history.clear();
    this.savedUndoDepth = 0;
    this.bakedDirty = wasDirty;
    this.selection.clear();
    const pages: PageSnapshot[] = this.state.pages.map((p) => {
      const live = doc.page(p.pageIndex);
      if (!live.loaded) return p;
      return {
        ...p,
        revision: live.revision,
        runs: live.runs.map((r) => r.snapshot()),
        images: live.images.map((img) => img.snapshot()),
      };
    });
    this.patch({ groupingMode: mode, pages, dirty: this.isDirty() });
  }

  /**
   * Begin a load and return a token. A concurrent/later load increments
   * the token; the async loader checks `isCurrentLoad(token)` after every
   * await so a superseded load bails instead of clobbering the new doc.
   */
  beginLoad(): number {
    return ++this.loadToken;
  }

  isCurrentLoad(token: number): boolean {
    return this.loadToken === token;
  }

  async setDocument(doc: EditorDocument): Promise<void> {
    this.disposeDocumentIfAny();
    this.doc = doc;
    this.history.clear();
    this.savedUndoDepth = 0;
    this.bakedDirty = false;
    this.selection.clear();
    this.patch({
      hasDocument: true,
      pageCount: doc.pageCount,
      pages: [],
      dirty: false,
      loading: false,
      firstPageRendered: false,
      error: null,
    });
  }

  clearDocument(): void {
    this.disposeDocumentIfAny();
    this.history.clear();
    this.savedUndoDepth = 0;
    this.bakedDirty = false;
    this.selection.clear();
    this.state = INITIAL;
    this.notify();
  }

  /** Mark the current edit state as saved; clears the dirty indicator. */
  markSaved(): void {
    this.savedUndoDepth = this.history.size().undo;
    this.bakedDirty = false;
    this.patch({ dirty: false });
  }

  /** Apply a command via the history stack, re-snapshot, and notify. */
  dispatch(cmd: Command): void {
    if (!this.doc) return;
    this.history.execute(cmd, this.doc);
    this.resnapshot();
    this.patch({ dirty: this.isDirty() });
  }

  undo(): void {
    if (!this.doc) return;
    this.history.undo(this.doc);
    this.resnapshot();
    this.patch({ dirty: this.isDirty() });
  }

  redo(): void {
    if (!this.doc) return;
    this.history.redo(this.doc);
    this.resnapshot();
    this.patch({ dirty: this.isDirty() });
  }

  /** Revert every edit in history; document returns to its load state. */
  resetAll(): void {
    if (!this.doc) return;
    this.history.undoAll(this.doc);
    this.resnapshot();
    this.patch({ dirty: this.isDirty() });
  }

  /**
   * Re-read the model into a fresh page-snapshot array and publish it.
   * Does NOT trigger a PDFium re-read; just turns the in-memory TextRun /
   * ImageObject mutations into immutable snapshots the React layer can
   * diff against.
   *
   * Reuses the previous snapshot object reference for any page whose
   * `revision` hasn't changed. Each command calls `page.markDirty()`
   * which bumps the revision counter, so an unchanged revision means the
   * page's runs / images were untouched. Reusing the reference lets
   * React.memo / useMemo consumers downstream skip O(runs) work per
   * untouched page on every keystroke.
   */
  resnapshot(): void {
    if (!this.doc) return;
    let changed = false;
    const doc = this.doc;
    const pages: PageSnapshot[] = this.state.pages.map((p) => {
      const live = doc.page(p.pageIndex);
      if (live.revision === p.revision) return p;
      changed = true;
      return {
        ...p,
        dirty: live.dirty,
        revision: live.revision,
        runs: live.runs.map((r) => r.snapshot()),
        images: live.images.map((img) => img.snapshot()),
      };
    });
    if (!changed) return;
    this.patch({ pages });
  }

  /**
   * Push a fresh page snapshot list into the store - called by the React
   * loader once `PdfiumTextReader` finishes for a page.
   */
  publishPages(pages: PageSnapshot[]): void {
    this.patch({ pages });
  }

  /**
   * Document-level dirty bit. Derived from the undo-stack depth relative
   * to the last save (plus a baked-edit flag) rather than per-page
   * `page.dirty`, because a command's revert can't clear `page.dirty` -
   * so undoing every edit must still report the doc as clean.
   */
  private isDirty(): boolean {
    if (!this.doc) return false;
    return this.bakedDirty || this.history.size().undo !== this.savedUndoDepth;
  }

  private patch(partial: Partial<EditorViewState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  private notify(): void {
    // Snapshot listeners before iterating. A listener that synchronously
    // calls back into `dispatch` / `undo` / `redo` (e.g. via a React
    // setState that triggers a chained effect) would mutate `this.listeners`
    // mid-iteration; iterating the live Set would either skip new
    // subscribers or re-dispatch to stale ones depending on Set semantics.
    // A snapshot makes the notify pass deterministic.
    const snapshot = Array.from(this.listeners);
    for (const l of snapshot) {
      try {
        l(this.state);
      } catch {
        /* one listener throwing must not stop the rest */
      }
    }
  }

  private disposeDocumentIfAny(): void {
    if (this.doc) {
      try {
        this.doc.dispose();
      } catch {
        /* best-effort */
      }
      this.doc = null;
    }
  }

  dispose(): void {
    this.disposeDocumentIfAny();
    this.listeners.clear();
  }
}
