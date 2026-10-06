import {
  RolledBackError,
  type Command,
} from "@app/tools/pdfTextEditor/commands/Command";
import { CompositeCommand } from "@app/tools/pdfTextEditor/commands/CompositeCommand";
import { UngroupParagraphCommand } from "@app/tools/pdfTextEditor/commands/UngroupParagraphCommand";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { TableModel } from "@app/tools/pdfTextEditor/model/TableModel";
import type { TableSnapshot } from "@app/tools/pdfTextEditor/types";
import {
  adoptedTableModel,
  overlaps,
} from "@app/tools/pdfTextEditor/util/tableAdoption";
import { detectTables } from "@app/tools/pdfTextEditor/util/tableDetection";

/** Keeps an adopted grid and the paragraph splits backing its cells in one undo step. */
export class AdoptTableCommand implements Command {
  readonly type = "adopt-table";
  private readonly splits: CompositeCommand;
  private model: TableModel | null = null;

  constructor(
    private readonly table: TableSnapshot,
    private readonly tableId: string,
    runIds: string[],
  ) {
    this.splits = new CompositeCommand(
      runIds.map(
        (runId) =>
          new UngroupParagraphCommand({ pageIndex: table.pageIndex, runId }),
      ),
    );
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.table.pageIndex);
    this.splits.apply(doc);
    try {
      const fresh = detectTables(
        page.runs.map((run) => run.snapshot()),
        page.index,
        {},
        page.rules,
      );
      const rebuilt = fresh.find((table) =>
        overlaps(table.bounds, this.table.bounds),
      );
      if (!rebuilt)
        throw new Error(
          "Could not identify the table after splitting its text.",
        );
      this.model = adoptedTableModel(doc.module, page, {
        ...rebuilt,
        id: this.tableId,
      });
      page.tables = [...page.tables, this.model];
      page.bumpRevision();
    } catch (error) {
      this.splits.revert(doc);
      throw new RolledBackError(error);
    }
  }

  revert(doc: EditorDocument): void {
    const page = doc.page(this.table.pageIndex);
    this.splits.revert(doc);
    page.tables = page.tables.filter((table) => table !== this.model);
    this.model = null;
    page.bumpRevision();
  }
}
