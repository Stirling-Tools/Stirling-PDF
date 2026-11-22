import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

const SINGLE_LINE_EM = 1.2;

export class SetLineSpacingCommand implements Command {
  readonly type = "set-line-spacing";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly factor: number;
  private prevLineHeight = 0;
  private reflow: ReflowWrapCommand | null = null;

  constructor(opts: { pageIndex: number; runId: string; factor: number }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.factor = opts.factor;
  }

  apply(doc: EditorDocument): void {
    const run = doc.page(this.pageIndex).findRun(this.runId);
    if (!run || run.fontSize <= 0) return;
    this.prevLineHeight = run.paragraphLineHeight;
    run.paragraphLineHeight = run.fontSize * SINGLE_LINE_EM * this.factor;
    this.reflow = new ReflowWrapCommand({
      pageIndex: this.pageIndex,
      runId: this.runId,
      maxWidthPt: run.wrapWidthPt ?? run.bounds.width + 0.5,
      relayout: true,
    });
    const userWidth = run.wrapWidthPt;
    this.reflow.apply(doc);
    run.wrapWidthPt = userWidth;
  }

  revert(doc: EditorDocument): void {
    this.reflow?.revert(doc);
    this.reflow = null;
    const run = doc.page(this.pageIndex).findRun(this.runId);
    if (run) run.paragraphLineHeight = this.prevLineHeight;
  }
}
