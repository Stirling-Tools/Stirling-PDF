import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import {
  setScanOverride,
  type ScanOverride,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import {
  preferredScanFace,
  setPreferredScanFace,
  type RankedStyle,
} from "@editor/tools/pdfTextEditor/commands/scanFit";

export class SetScanStyleCommand implements Command {
  readonly type = "set-scan-style";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly choice: RankedStyle;
  private prev: ScanOverride | null = null;
  private prevPreferred: string | null = null;

  constructor(opts: { pageIndex: number; runId: string; choice: RankedStyle }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.choice = opts.choice;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    const prevPreferred = preferredScanFace(doc);
    this.prev = setScanOverride(doc, page, run, (o) => ({
      ...o,
      family: undefined,
      style: this.choice.style,
    }));
    if (!this.prev) return;
    this.prevPreferred = prevPreferred;
    setPreferredScanFace(doc, this.choice.face.label);
  }

  revert(doc: EditorDocument): void {
    const prev = this.prev;
    if (!prev) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    setPreferredScanFace(doc, this.prevPreferred);
    if (run) setScanOverride(doc, page, run, () => prev);
    this.prev = null;
  }

  describe(): string {
    return `Match scanned text to ${this.choice.face.label}`;
  }
}
