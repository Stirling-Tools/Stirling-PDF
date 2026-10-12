import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

/** Toggle the session-only `locked` flag on a text run or image object. */
export class SetLockCommand implements Command {
  readonly type = "set-lock";
  private readonly pageIndex: number;
  private readonly runId: string | null;
  private readonly imageId: string | null;
  private readonly nextLocked: boolean;
  private prevLocked: boolean | null;

  constructor(opts: {
    pageIndex: number;
    runId?: string;
    imageId?: string;
    locked: boolean;
  }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId ?? null;
    this.imageId = opts.imageId ?? null;
    this.nextLocked = opts.locked;
    this.prevLocked = null;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    if (this.runId) {
      const run = page.runs.find((r) => r.id === this.runId);
      if (!run) return;
      if (this.prevLocked === null) this.prevLocked = run.locked;
      run.locked = this.nextLocked;
      // Refresh the overlay snapshot so contentEditable/hit-test reflect
      // the new lock state; lock is session-only, never dirties the page.
      page.bumpRevision();
      return;
    }
    if (this.imageId) {
      const img = page.images.find((i) => i.id === this.imageId);
      if (!img) return;
      if (this.prevLocked === null) this.prevLocked = img.locked;
      img.locked = this.nextLocked;
      page.bumpRevision();
    }
  }

  revert(doc: EditorDocument): void {
    if (this.prevLocked === null) return;
    const page = doc.page(this.pageIndex);
    if (this.runId) {
      const run = page.runs.find((r) => r.id === this.runId);
      if (run) run.locked = this.prevLocked;
      page.bumpRevision();
      return;
    }
    if (this.imageId) {
      const img = page.images.find((i) => i.id === this.imageId);
      if (img) img.locked = this.prevLocked;
      page.bumpRevision();
    }
  }
}
