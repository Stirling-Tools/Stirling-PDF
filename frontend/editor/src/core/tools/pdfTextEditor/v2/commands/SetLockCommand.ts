import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

/**
 * Toggle the session-only `locked` flag on a text run or image object.
 * Locking makes the object inert: it skips hit-test in TextRunOverlay /
 * ImageHandle and any drag/edit gesture becomes a no-op. The PDFium
 * bitmap still renders the object exactly as before, so the user can
 * see it - the editor just refuses to act on it.
 *
 * Lock state is intentionally NOT serialized to the saved PDF. It is
 * an editor-session affordance only; reopening the file resets every
 * object to unlocked.
 */
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
      return;
    }
    if (this.imageId) {
      const img = page.images.find((i) => i.id === this.imageId);
      if (!img) return;
      if (this.prevLocked === null) this.prevLocked = img.locked;
      img.locked = this.nextLocked;
    }
  }

  revert(doc: EditorDocument): void {
    if (this.prevLocked === null) return;
    const page = doc.page(this.pageIndex);
    if (this.runId) {
      const run = page.runs.find((r) => r.id === this.runId);
      if (run) run.locked = this.prevLocked;
      return;
    }
    if (this.imageId) {
      const img = page.images.find((i) => i.id === this.imageId);
      if (img) img.locked = this.prevLocked;
    }
  }
}
