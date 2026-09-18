import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

// Every user-initiated mutation goes through a Command so it can be recorded,
// replayed, and reverted by the HistoryStack.
export interface Command {
  /** Stable identifier for telemetry / debugging. */
  readonly type: string;
  apply(doc: EditorDocument): void;
  revert(doc: EditorDocument): void;
  // Optional - some commands describe themselves for the UI (e.g. "Type in run
  // 'A1'", shown in undo history tooltips).
  describe?(): string;
  /** Optional coalescing key. Return null / undefined to never coalesce. */
  coalesceKey?(): string | null;
  // Optional - when true, a matching `coalesceKey` merges this command into the
  // previous undo step however long ago that step ran.
  coalesceIgnoresTimeWindow?(previous: Command | null): boolean;
  // Optional - fold an already-applied follow-up into this command instead of
  // wrapping both in a CompositeCommand. Returns the command the history
  // should keep, or null when a merge would not be equivalent. Must never
  // mutate `this`: the caller needs the returned object to be a different
  // reference so saved-position dirty tracking still sees a new step.
  absorb?(next: Command): Command | null;
}

export class RolledBackError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "RolledBackError";
    this.cause = cause;
  }
}
