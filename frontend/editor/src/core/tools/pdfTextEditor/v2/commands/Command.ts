import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

/**
 * Every user-initiated mutation goes through a Command so it can be
 * recorded, replayed, and reverted by the HistoryStack.
 *
 * Implementations should be pure of UI concerns - they take only the
 * document and the data needed to mutate it.
 */
export interface Command {
  /** Stable identifier for telemetry / debugging. */
  readonly type: string;
  apply(doc: EditorDocument): void;
  revert(doc: EditorDocument): void;
  /**
   * Optional - some commands describe themselves for the UI (e.g.
   * "Type in run 'A1'", shown in undo history tooltips).
   */
  describe?(): string;
  /**
   * Optional coalescing key. Consecutive commands with the same non-null
   * key (within a short time window) are grouped into one undo step, so a
   * burst of keystrokes on one run reverts in a single undo. Return null /
   * undefined to never coalesce.
   */
  coalesceKey?(): string | null;
  /**
   * Optional - when true, a matching `coalesceKey` merges this command into
   * the previous undo step however long ago that step ran. For follow-ups
   * that are never a user action in their own right (the wrap reflow a blur
   * triggers): the gap before them is the user's think-time, so a time
   * window would split one logical edit into two undo steps, the first of
   * which looks like a dead Ctrl+Z.
   */
  coalesceIgnoresTimeWindow?(): boolean;
}
