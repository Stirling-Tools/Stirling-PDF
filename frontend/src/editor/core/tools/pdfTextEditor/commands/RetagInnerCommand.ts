import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import { splitByBlock } from "@editor/tools/pdfTextEditor/commands/splitByBlock";
import { elementStretches } from "@editor/tools/pdfTextEditor/commands/TagTextRangeCommand";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { isInlineType } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";

/**
 * Retag element `key`, one marking part of a block's text, or remove it with
 * null, its text read as its block's again. Held on the page's structure and
 * written by the save; the page content keeps its marks. Retagged as a block,
 * its text moves into a run of its own.
 */
export class RetagInnerCommand implements Command {
  readonly type = "retag-inner";
  private readonly pageIndex: number;
  private readonly key: string;
  private readonly to: StructureType | null;
  private undo: Array<() => void> = [];
  private movedTo: string | null = null;

  constructor(opts: {
    pageIndex: number;
    key: string;
    type: StructureType | null;
  }) {
    this.pageIndex = opts.pageIndex;
    this.key = opts.key;
    this.to = opts.type;
  }

  /**
   * The run the element's text was moved into, once applied; null while it
   * is in the run it was in.
   */
  get movedToRunId(): string | null {
    return this.movedTo;
  }

  apply(doc: EditorDocument): void {
    const structure = doc.structure(this.pageIndex);
    const undo: Array<() => void> = [];
    try {
      const previous = structure.innerType(this.key);
      structure.setInnerType(this.key, this.to);
      // Only an element of a standard type can be changed or removed.
      undo.push(() => structure.setInnerType(this.key, previous?.type ?? null));
      this.movedTo =
        this.to !== null && !isInlineType(this.to)
          ? this.moveToOwnRun(doc, undo)
          : null;
    } catch (err) {
      rollBack(undo);
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotRetag",
            "This text's tag can't be changed.",
          ),
          { cause: err },
        ),
      );
    }
    this.undo = undo;
    doc.page(this.pageIndex).bumpRevision();
  }

  revert(doc: EditorDocument): void {
    rollBack(this.undo);
    this.undo = [];
    doc.page(this.pageIndex).bumpRevision();
  }

  private moveToOwnRun(
    doc: EditorDocument,
    undo: Array<() => void>,
  ): string | null {
    const page = doc.page(this.pageIndex);
    const holds = (runId: string) =>
      elementStretches(doc, this.pageIndex, runId).some(
        ({ element }) => element.key === this.key,
      );
    const holders = page.runs.filter((run) => holds(run.id));
    const moved = holders
      .flatMap((run) => splitByBlock(doc, page, run, undo))
      .find((part) => !holders.includes(part) && holds(part.id));
    return moved?.id ?? null;
  }
}

function rollBack(undo: Array<() => void>): void {
  while (undo.length > 0) undo.pop()!();
}
