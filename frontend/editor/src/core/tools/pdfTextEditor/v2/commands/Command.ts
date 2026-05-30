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
}
