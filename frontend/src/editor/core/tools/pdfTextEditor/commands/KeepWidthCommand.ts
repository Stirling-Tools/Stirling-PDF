import {
  layoutBefore,
  wrapToWidthBefore,
  type ReflowWrapCommand,
} from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

export class KeepWidthCommand implements Command {
  readonly type: string;
  private readonly inner: Command;
  private readonly pageIndex: number;
  private readonly runId: string;
  private rewrap: ReflowWrapCommand | null = null;

  constructor(inner: Command, opts: { pageIndex: number; runId: string }) {
    this.inner = inner;
    this.type = inner.type;
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const before = page.findRun(this.runId);
    const laidOut = before ? layoutBefore(before) : null;
    this.inner.apply(doc);
    const run = page.findRun(this.runId);
    this.rewrap =
      run && laidOut ? wrapToWidthBefore(doc, page, run, laidOut) : null;
  }

  revert(doc: EditorDocument): void {
    this.rewrap?.revert(doc);
    this.rewrap = null;
    this.inner.revert(doc);
  }

  describe(): string {
    return this.inner.describe?.() ?? this.type;
  }
}
