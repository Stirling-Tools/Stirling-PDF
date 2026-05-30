import type { SelectionState } from "@app/tools/pdfTextEditor/v2/types";

/**
 * Singleton "find highlight" state, kept off the SelectionState (which
 * is used for edit commands) so search highlights survive normal
 * selection changes. Subscribers update via `Selection.highlight$`.
 */
export class FindHighlight {
  private id: string | null = null;
  private listeners: Set<(id: string | null) => void> = new Set();

  set(runId: string | null): void {
    if (this.id === runId) return;
    this.id = runId;
    for (const l of this.listeners) l(this.id);
  }
  get(): string | null {
    return this.id;
  }
  subscribe(l: (id: string | null) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export class Selection {
  private state: SelectionState;
  private listeners: Set<(s: SelectionState) => void>;
  /** Yellow highlight for the current find-bar match. */
  readonly highlight: FindHighlight;

  constructor() {
    this.state = { runIds: [], imageIds: [], caret: null };
    this.listeners = new Set();
    this.highlight = new FindHighlight();
  }

  get value(): SelectionState {
    return this.state;
  }

  set(next: SelectionState): void {
    this.state = next;
    this.notify();
  }

  clear(): void {
    this.set({ runIds: [], imageIds: [], caret: null });
  }

  selectOne(runId: string, caret: number | null = null): void {
    this.set({ runIds: [runId], imageIds: [], caret });
  }

  toggle(runId: string): void {
    if (this.state.runIds.includes(runId)) {
      this.set({
        ...this.state,
        runIds: this.state.runIds.filter((id) => id !== runId),
        caret: null,
      });
    } else {
      this.set({
        ...this.state,
        runIds: [...this.state.runIds, runId],
        caret: null,
      });
    }
  }

  selectImage(imageId: string): void {
    this.set({ runIds: [], imageIds: [imageId], caret: null });
  }

  selectMany(runIds: string[]): void {
    this.set({ runIds: [...runIds], imageIds: [], caret: null });
  }

  subscribe(listener: (s: SelectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l(this.state);
  }
}
