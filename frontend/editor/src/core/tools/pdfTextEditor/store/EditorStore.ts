import { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import {
  HistoryStack,
  HistoryStepError,
} from "@app/tools/pdfTextEditor/store/HistoryStack";
import { Selection } from "@app/tools/pdfTextEditor/store/Selection";
import { pageGuides } from "@app/tools/pdfTextEditor/util/guides";
import { PdfiumTextReader } from "@app/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  PdfiumModelSync,
  type ModelSyncResult,
} from "@app/tools/pdfTextEditor/pdfium/PdfiumModelSync";
import { resetBackendResolverCaches } from "@app/tools/pdfTextEditor/charcode/BackendResolver";
import { resetCmapCache } from "@app/tools/pdfTextEditor/charcode/CmapResolver";
import { resetContentStreamCache } from "@app/tools/pdfTextEditor/charcode/ContentStreamResolver";
import {
  resetCharCoverageCache,
  resetDroppedBase14Chars,
  resetOnPageAdvCache,
  resetPerCharBranchPtrs,
} from "@app/tools/pdfTextEditor/commands/editTextHelpers";
import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import type {
  GroupingMode,
  PageSnapshot,
  WidthMode,
} from "@app/tools/pdfTextEditor/types";
import { resetEmbeddedFaces } from "@app/tools/pdfTextEditor/util/embeddedFace";

/** Drop EVERY per-document charcode/glyph cache. */
function resetCharcodeCaches(): void {
  resetBackendResolverCaches();
  resetCmapCache();
  resetContentStreamCache();
  resetOnPageAdvCache();
  // The per-char ptr set is doc-scoped since PDFium reuses pointers.
  resetPerCharBranchPtrs();
  // The dropped-char record is per-session/per-document, not pointer-keyed.
  resetDroppedBase14Chars();
  resetCharCoverageCache();
  // FontFaces are keyed by font pointer, which PDFium reuses across documents.
  resetEmbeddedFaces();
}

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
  // Set when a load hit a password-protected PDF and the UI should prompt.
  // `retry` is true after a wrong password so the prompt can say so.
  passwordPrompt: { fileName: string; retry: boolean } | null;
  /** Pixel scale at which previews are rendered. */
  renderScale: number;
  /** What clicks on the page area do. */
  mode: InteractionMode;
  /** How the reader clusters source text into editable runs. */
  groupingMode: GroupingMode;
  // How an editable text box resizes as the user types more than fits: -
  // "grow": the box widens to the right, never wrapping.
  widthMode: WidthMode;
  /** Show per-page rulers and alignment guides. */
  showRulers: boolean;
  // Find and shortcuts are opened from the canvas top bar but rendered beside
  // the pages, and the panel's keyboard shortcuts drive both - so the flags
  // live on the store both surfaces already share.
  findOpen: boolean;
  helpOpen: boolean;
}

const POSITION_REFRESH_MS = 600;

// Longest the engine's pen positions may stay stale while the user keeps
// typing. Past this the debounce above stops being postponed and runs anyway.
const POSITION_REFRESH_MAX_STALL_MS = 100;

const INITIAL: EditorViewState = {
  hasDocument: false,
  pageCount: 0,
  pages: [],
  dirty: false,
  loading: false,
  firstPageRendered: false,
  progress: null,
  error: null,
  passwordPrompt: null,
  renderScale: 1.5,
  mode: "select",
  groupingMode: "auto",
  widthMode: "grow",
  showRulers: false,
  findOpen: false,
  helpOpen: false,
};

// Single observable store for the editor's React layer. Components never reach
// into PDFium directly - they dispatch commands.
export class EditorStore {
  readonly history: HistoryStack;
  readonly selection: Selection;
  private doc: EditorDocument | null;
  private state: EditorViewState;
  private listeners: Set<(s: EditorViewState) => void>;
  // The undo-stack TOP at the last save; the doc is dirty when the current top
  // is a different command object.
  private savedTop: Command | null = null;
  /** True when edits were baked into the stream (e.g. grouping-mode switch). */
  private bakedDirty = false;
  private positionRefreshTimer: number | null = null;
  /** When the debounced position refresh last actually ran. */
  private lastPositionRefreshAt = 0;
  /** Monotonic token so a superseded async load can detect it lost the race. */
  private loadToken = 0;
  /** File awaiting a password retry; held off the view state (not serialisable). */
  private _pendingPasswordFile: File | null = null;

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
    // Starting a load clears any stale error.
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

  /** A load needs a password. */
  setPasswordRequired(file: File, retry: boolean): void {
    this._pendingPasswordFile = file;
    this.patch({
      passwordPrompt: { fileName: file.name, retry },
      loading: false,
      error: null,
    });
  }

  /** Dismiss the password prompt (cancel or success) and drop the pending file. */
  clearPasswordPrompt(): void {
    this._pendingPasswordFile = null;
    if (this.state.passwordPrompt) this.patch({ passwordPrompt: null });
  }

  get pendingPasswordFile(): File | null {
    return this._pendingPasswordFile;
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

  setShowRulers(showRulers: boolean): void {
    this.patch({ showRulers });
  }

  setFindOpen(findOpen: boolean): void {
    if (this.state.findOpen === findOpen) return;
    this.patch({ findOpen });
  }

  setHelpOpen(helpOpen: boolean): void {
    if (this.state.helpOpen === helpOpen) return;
    this.patch({ helpOpen });
  }

  get groupingMode(): GroupingMode {
    return this.state.groupingMode;
  }

  // Switch how source text is clustered into runs (Auto = detect paragraphs,
  // Line = one run per source line).
  setGroupingMode(mode: GroupingMode): void {
    if (this.state.groupingMode === mode) return;
    const doc = this.doc;
    if (!doc) {
      this.patch({ groupingMode: mode });
      return;
    }
    // Re-reading rebuilds run IDs, so the undo history can't survive the switch
    // and is cleared.
    const wasDirty = this.isDirty();
    // Flushes first: the rebuilt runs must reflect the user's current edits.
    this.repopulateAllPages(doc, mode);
    this.history.clear();
    this.savedTop = null;
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
        // Regrouping re-populates the page, which re-reads its annotations.
        annotations: live.annotations,
      };
    });
    this.patch({ groupingMode: mode, pages, dirty: this.isDirty() });
  }

  /** Begin a load and return a token. */
  beginLoad(): number {
    return ++this.loadToken;
  }

  isCurrentLoad(token: number): boolean {
    return this.loadToken === token;
  }

  async setDocument(doc: EditorDocument): Promise<void> {
    this.disposeDocumentIfAny();
    resetCharcodeCaches();
    this.doc = doc;
    this.history.clear();
    this.savedTop = null;
    this.bakedDirty = false;
    this.selection.clear();
    pageGuides.clear();
    this._pendingPasswordFile = null;
    this.patch({
      hasDocument: true,
      pageCount: doc.pageCount,
      pages: [],
      dirty: false,
      loading: false,
      firstPageRendered: false,
      error: null,
      passwordPrompt: null,
    });
  }

  clearDocument(): void {
    this.disposeDocumentIfAny();
    resetCharcodeCaches();
    this.history.clear();
    this.savedTop = null;
    this.bakedDirty = false;
    this.selection.clear();
    this._pendingPasswordFile = null;
    this.state = INITIAL;
    this.notify();
  }

  /** Mark the current edit state as saved; clears the dirty indicator. */
  savedPosition(): Command | null {
    this.history.breakCoalescing();
    return this.history.peekUndo();
  }

  markSaved(position?: Command | null): void {
    // Break the coalesce burst so a post-save keystroke is a new dirtying step.
    this.history.breakCoalescing();
    const saved = position === undefined ? this.history.peekUndo() : position;
    this.savedTop = saved;
    this.bakedDirty = false;
    this.patch({ dirty: this.isDirty() });
  }

  /** Apply a command via the history stack, re-snapshot, and notify. */
  dispatch(cmd: Command): void {
    if (!this.doc) return;
    try {
      this.history.execute(cmd, this.doc);
    } catch (err) {
      // A forward edit can break the document exactly like an undo can, so it
      // gets the same recovery rather than throwing out of the click handler.
      this.recoverFromBrokenStep(err);
      return;
    }
    this.resnapshot();
    this.patch({ dirty: this.isDirty() });
    this.schedulePositionRefresh();
  }

  private schedulePositionRefresh(): void {
    if (typeof window === "undefined") return;
    if (this.positionRefreshTimer !== null) {
      window.clearTimeout(this.positionRefreshTimer);
    }
    // Debounced, but never starved. Re-clearing the timer on every keystroke
    // meant a continuous burst postponed this indefinitely, and until it runs
    // the overlay has no measured pen positions for the new text - so it lays
    // it out on the BROWSER's advances and the caret walks off the glyphs the
    // page is actually showing, about a pixel per character, snapping back
    // only when the user pauses. A full recapture of every loaded page costs
    // single-digit milliseconds, so a burst can afford one every so often.
    const since = Date.now() - this.lastPositionRefreshAt;
    const delay = Math.min(
      POSITION_REFRESH_MS,
      Math.max(0, POSITION_REFRESH_MAX_STALL_MS - since),
    );
    this.positionRefreshTimer = window.setTimeout(() => {
      this.positionRefreshTimer = null;
      this.lastPositionRefreshAt = Date.now();
      const doc = this.doc;
      if (!doc) return;
      const changedByPage = new Map<number, Set<TextRun>>();
      for (const page of doc.loadedPages()) {
        try {
          // Positions only. `PdfiumModelSync.resyncPage` re-reads the whole
          // page and would give identity-preserved RUNS too, but it re-runs
          // grouping, font registration and the annotation walk on every tick
          // for no gain while only positions may safely be adopted mid-edit.
          const changed = PdfiumTextReader.recapturePositions(doc, page);
          if (changed.size > 0) changedByPage.set(page.index, changed);
        } catch {
          continue;
        }
      }
      if (changedByPage.size > 0) this.refreshRunSnapshots(changedByPage);
    }, delay);
  }

  // Re-read one page's geometry from the engine immediately, keeping run ids.
  // The debounced refresh above calls the same thing; this is the un-debounced
  // entry point for callers that need it now (and for measuring its cost).
  resyncPage(pageIndex: number): ModelSyncResult | null {
    const doc = this.doc;
    if (!doc) return null;
    try {
      return PdfiumModelSync.resyncPage(
        doc,
        doc.page(pageIndex),
        this.groupingMode,
      );
    } catch {
      return null;
    }
  }

  // Publish fresh snapshots ONLY for runs whose positions moved. Re-snapshotting
  // every run made the periodic tick re-render every overlay on every page per
  // keystroke; reusing identities lets React skip the untouched ones.
  private refreshRunSnapshots(changedByPage: Map<number, Set<TextRun>>): void {
    const doc = this.doc;
    if (!doc) return;
    this.patch({
      pages: this.state.pages.map((p) => {
        const changed = changedByPage.get(p.pageIndex);
        if (!changed || changed.size === 0) return p;
        const live = doc.page(p.pageIndex);
        const prevById = new Map(p.runs.map((s) => [s.id, s]));
        return {
          ...p,
          runs: live.runs.map((r) =>
            changed.has(r)
              ? r.snapshot()
              : (prevById.get(r.id) ?? r.snapshot()),
          ),
        };
      }),
    });
  }

  undo(): void {
    if (!this.doc) return;
    try {
      this.history.undo(this.doc);
    } catch (err) {
      this.recoverFromBrokenStep(err);
      return;
    }
    this.resnapshot();
    this.patch({ dirty: this.isDirty() });
  }

  redo(): void {
    if (!this.doc) return;
    try {
      this.history.redo(this.doc);
    } catch (err) {
      this.recoverFromBrokenStep(err);
      return;
    }
    this.resnapshot();
    this.patch({ dirty: this.isDirty() });
  }

  // A half-applied command leaves the run model describing objects that no
  // longer match the page, so rebuild it from PDFium rather than guess. A
  // command that rolled itself back changed nothing, so it keeps its history.
  private recoverFromBrokenStep(err?: unknown): void {
    const doc = this.doc;
    if (!doc) return;
    // The wrapper says which phase broke; the cause says what actually failed,
    // and that is the half worth putting in front of the user.
    const reason = err instanceof HistoryStepError ? err.cause : err;
    const message = reason instanceof Error ? reason.message : null;
    if (err instanceof HistoryStepError && err.documentIntact) {
      this.resnapshot();
      this.patch({
        dirty: this.isDirty(),
        error: message ?? this.state.error,
      });
      return;
    }
    this.repopulateAllPages(doc, this.state.groupingMode);
    // Rebuilt runs get fresh ids, so no existing history entry can apply.
    this.history.clear();
    this.savedTop = null;
    this.bakedDirty = true;
    this.selection.clear();
    this.resnapshot();
    this.patch({ dirty: true, error: message ?? this.state.error });
  }

  /** Drop every page's run model and read it back from the document. */
  private repopulateAllPages(doc: EditorDocument, mode: GroupingMode): void {
    for (const page of doc.loadedPages()) {
      if (!page.loaded) continue;
      page.flushGenerate(doc.module);
      page.loaded = false;
      page.setRuns([]);
      page.setImages([]);
      PdfiumTextReader.populate(doc, page, mode);
    }
  }

  /** Revert every edit in history; document returns to its load state. */
  resetAll(): void {
    if (!this.doc) return;
    this.history.undoAll(this.doc);
    this.resnapshot();
    this.patch({ dirty: this.isDirty() });
  }

  /** Re-read the model into a fresh page-snapshot array and publish it. */
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

  // Push a fresh page snapshot list into the store - called by the React loader
  // once `PdfiumTextReader` finishes for a page.
  publishPages(pages: PageSnapshot[]): void {
    this.patch({ pages });
  }

  /** Document-level dirty bit. */
  private isDirty(): boolean {
    if (!this.doc) return false;
    return this.bakedDirty || this.history.peekUndo() !== this.savedTop;
  }

  private patch(partial: Partial<EditorViewState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  private notify(): void {
    // Snapshot listeners before iterating.
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
