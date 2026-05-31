import { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { HistoryStack } from "@app/tools/pdfTextEditor/v2/store/HistoryStack";
import { Selection } from "@app/tools/pdfTextEditor/v2/store/Selection";
import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { PageSnapshot } from "@app/tools/pdfTextEditor/v2/types";

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

  setLoading(loading: boolean, error: string | null = null): void {
    this.patch({
      loading,
      error,
      progress: loading ? this.state.progress : null,
    });
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

  async setDocument(doc: EditorDocument): Promise<void> {
    this.disposeDocumentIfAny();
    this.doc = doc;
    this.history.clear();
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
    this.selection.clear();
    this.state = INITIAL;
    this.notify();
  }

  /** Apply a command via the history stack, re-snapshot, and notify. */
  dispatch(cmd: Command): void {
    if (!this.doc) return;
    this.history.execute(cmd, this.doc);
    this.resnapshot();
    this.patch({ dirty: true });
  }

  undo(): void {
    if (!this.doc) return;
    this.history.undo(this.doc);
    this.resnapshot();
    this.patch({ dirty: this.anyDirty() });
  }

  redo(): void {
    if (!this.doc) return;
    this.history.redo(this.doc);
    this.resnapshot();
    this.patch({ dirty: this.anyDirty() });
  }

  /** Revert every edit in history; document returns to its load state. */
  resetAll(): void {
    if (!this.doc) return;
    this.history.undoAll(this.doc);
    this.resnapshot();
    this.patch({ dirty: this.anyDirty() });
  }

  /**
   * Re-read the model into a fresh page-snapshot array and publish it.
   * Does NOT trigger a PDFium re-read; just turns the in-memory TextRun /
   * ImageObject mutations into immutable snapshots the React layer can
   * diff against.
   */
  resnapshot(): void {
    if (!this.doc) return;
    const pages: PageSnapshot[] = this.state.pages.map((p) => {
      const live = this.doc!.page(p.pageIndex);
      return {
        ...p,
        dirty: live.dirty,
        revision: live.revision,
        runs: live.runs.map((r) => r.snapshot()),
        images: live.images.map((img) => img.snapshot()),
      };
    });
    this.patch({ pages });
  }

  /**
   * Push a fresh page snapshot list into the store - called by the React
   * loader once `PdfiumTextReader` finishes for a page.
   */
  publishPages(pages: PageSnapshot[]): void {
    this.patch({ pages });
  }

  private anyDirty(): boolean {
    if (!this.doc) return false;
    return this.doc.loadedPages().some((p) => p.dirty);
  }

  private patch(partial: Partial<EditorViewState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  private notify(): void {
    for (const l of this.listeners) l(this.state);
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
