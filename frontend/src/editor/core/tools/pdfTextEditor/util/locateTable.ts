import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { TableModel } from "@app/tools/pdfTextEditor/model/TableModel";

/** Locate a session grid; missing tables return null after a document reload. */
export function locateTable(
  doc: EditorDocument,
  tableId: string,
): { page: Page; model: TableModel } | null {
  const match = /^p(\d+)-/.exec(tableId);
  const pages = match ? [doc.page(Number(match[1]))] : doc.loadedPages();
  for (const page of pages) {
    const model = page.tables.find((table) => table.id === tableId);
    if (model) return { page, model };
  }
  return null;
}
