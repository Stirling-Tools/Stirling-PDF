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
}

/**
 * A command failed to apply/revert but the document was put back as it was.
 *
 * Only `CompositeCommand` can promise this - it knows which children ran and
 * can undo exactly those. The store reads it to decide whether the run model
 * still describes the page (surface the error) or has to be rebuilt from
 * PDFium (throw the history away).
 */
export class RolledBackError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "RolledBackError";
    this.cause = cause;
  }
}
