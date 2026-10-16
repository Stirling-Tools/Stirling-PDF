import type { SelectionState } from "@app/tools/pdfTextEditor/types";

// Singleton "find highlight" state, kept off the SelectionState (which is used
// for edit commands) so search highlights survive normal selection changes.
export class FindHighlight {
  private id: string | null = null;
  private listeners: Set<(id: string | null) => void> = new Set();

  set(runId: string | null): void {
    if (this.id === runId) return;
    this.id = runId;
    // Snapshot + guard so one throwing/unsubscribing listener can't abort
    // notification of the rest (see EditorStore.notify for the rationale).
    for (const l of Array.from(this.listeners)) {
      try {
        l(this.id);
      } catch {
        /* one listener throwing must not stop the rest */
      }
    }
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
    this.state = { runIds: [], imageIds: [], shapeIds: [], caret: null };
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
    this.set({ runIds: [], imageIds: [], shapeIds: [], caret: null });
  }

  selectOne(runId: string, caret: number | null = null): void {
    this.set({ runIds: [runId], imageIds: [], shapeIds: [], caret });
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
    this.set({ runIds: [], imageIds: [imageId], shapeIds: [], caret: null });
  }

  selectShape(shapeId: string): void {
    this.set({ runIds: [], imageIds: [], shapeIds: [shapeId], caret: null });
  }

  toggleShape(shapeId: string): void {
    const shapeIds = this.state.shapeIds.includes(shapeId)
      ? this.state.shapeIds.filter((id) => id !== shapeId)
      : [...this.state.shapeIds, shapeId];
    this.set({ ...this.state, shapeIds, caret: null });
  }

  /**
   * Replace the selection with the given runs, images and shapes, or union
   * them into it when additive (an extending rectangle-select). Additive keeps
   * order and dedupes.
   */
  selectMany(
    runIds: string[],
    additive = false,
    imageIds: string[] = [],
    shapeIds: string[] = [],
  ): void {
    if (!additive) {
      this.set({
        runIds: [...runIds],
        imageIds: [...imageIds],
        shapeIds: [...shapeIds],
        caret: null,
      });
      return;
    }
    this.set({
      runIds: unionInOrder(this.state.runIds, runIds),
      imageIds: unionInOrder(this.state.imageIds, imageIds),
      shapeIds: unionInOrder(this.state.shapeIds, shapeIds),
      caret: null,
    });
  }

  subscribe(listener: (s: SelectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    // Snapshot + guard: a subscriber may synchronously unsubscribe others
    // or throw; iterating the live Set would skip listeners or abort early.
    for (const l of Array.from(this.listeners)) {
      try {
        l(this.state);
      } catch {
        /* one listener throwing must not stop the rest */
      }
    }
  }
}

function unionInOrder(existing: string[], added: string[]): string[] {
  const merged = [...existing];
  for (const id of added) {
    if (!merged.includes(id)) merged.push(id);
  }
  return merged;
}
