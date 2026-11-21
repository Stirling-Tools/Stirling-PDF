import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";

export interface PageRepaintArea {
  pageIndex: number;
  /** Raw page space. */
  area: PageRect;
}

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
  supersedes?(adjacent: Command): boolean;
  /** Whether `moveGroup` would take `group` in one move, without doing it. */
  wouldMoveGroup?(
    doc: EditorDocument,
    group: readonly Command[],
    phase: "apply" | "revert",
  ): boolean;
  /** Undo or redo a merged group in one move, on its last command; false steps through it instead. */
  moveGroup?(
    doc: EditorDocument,
    group: readonly Command[],
    phase: "apply" | "revert",
  ): boolean;
  /** True for a step the store attaches to the one before it, which is not a gesture of its own. */
  readonly followsPrevious?: boolean;
  /**
   * For a follow-up step: take back only what it changed outside the runs,
   * when the group's own undo restores the runs whole and the objects this
   * step moved in them no longer exist.
   */
  revertBesideGroup?(doc: EditorDocument): void;
  /** For a follow-up step: lay out again what a group's undo or redo of the steps it follows left behind. */
  relayoutAfterGroup?(doc: EditorDocument): void;
  /** The one page area this command draws in, asked before and after apply; null or absent redraws whole pages. */
  repaintArea?(doc: EditorDocument): PageRepaintArea | null;
}

export class RolledBackError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "RolledBackError";
    this.cause = cause;
  }
}
