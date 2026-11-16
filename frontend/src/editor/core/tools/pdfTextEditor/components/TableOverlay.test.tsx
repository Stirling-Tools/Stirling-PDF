import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TableOverlay } from "@editor/tools/pdfTextEditor/components/TableOverlay";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type {
  PageSnapshot,
  TableSnapshot,
} from "@editor/tools/pdfTextEditor/types";

const mocks = vi.hoisted(() => ({
  drawable: true,
  alert: vi.fn(),
}));
vi.mock("@editor/components/toast", () => ({ alert: mocks.alert }));
vi.mock("@editor/tools/pdfTextEditor/commands/tableHelpers", async (load) => ({
  ...(await load<object>()),
  cellTextDrawable: () => mocks.drawable,
}));
vi.mock("@editor/tools/pdfTextEditor/commands/FillTableCellCommand", () => ({
  FillTableCellCommand: class {
    readonly type = "fill-table-cell";
    insertedRunId: string | null = null;
    apply(): void {}
    revert(): void {}
  },
}));

const TABLE: TableSnapshot = {
  id: "t1",
  pageIndex: 0,
  rows: 1,
  cols: 1,
  colEdges: [100, 300],
  rowEdges: [500, 460],
  bounds: { x: 100, y: 460, width: 200, height: 40 },
  cells: [
    {
      row: 0,
      col: 0,
      rect: { x: 100, y: 460, width: 200, height: 40 },
      runIds: [],
      colSpan: 1,
      rowSpan: 1,
    },
  ],
  confidence: 1,
  synthetic: true,
  ruled: true,
  pageRuled: false,
  adopted: false,
  scanned: false,
  columnStyles: [],
  headerStyle: null,
};

const PAGE: PageSnapshot = {
  pageIndex: 0,
  width: 612,
  height: 792,
  dirty: false,
  revision: 0,
  runs: [],
  images: [],
  shapes: [],
  tables: [TABLE],
  display: DisplayTransform.identity(612, 792).toData(),
};

function renderCell(fills: boolean) {
  const store = {
    dispatch: vi.fn((cmd: { insertedRunId: string | null }) => {
      if (fills) cmd.insertedRunId = "cell-run";
    }),
    selection: { selectOne: vi.fn() },
  };
  render(
    <MantineProvider env="test">
      <TableOverlay
        page={PAGE}
        transform={DisplayTransform.identity(612, 792)}
        scale={1}
        store={store as unknown as EditorStore}
      />
    </MantineProvider>,
  );
  return { store, cell: screen.getByTestId("pdf-editor-table-cell-t1-0-0") };
}

function type(cell: HTMLElement, text: string): void {
  cell.textContent = text;
  fireEvent.blur(cell);
}

describe("typing into an empty table cell", () => {
  beforeEach(() => {
    mocks.drawable = true;
    mocks.alert.mockClear();
  });

  it("keeps text the table's fonts cannot draw in the cell and says why", () => {
    mocks.drawable = false;
    const { store, cell } = renderCell(true);
    type(cell, "A漢字");
    expect(store.dispatch).not.toHaveBeenCalled();
    expect(cell.textContent).toBe("A漢字");
    expect(mocks.alert).toHaveBeenCalledOnce();
  });

  it("keeps the text and says why when the fill draws nothing", () => {
    const { store, cell } = renderCell(false);
    type(cell, "Total");
    expect(store.dispatch).toHaveBeenCalledOnce();
    expect(cell.textContent).toBe("Total");
    expect(mocks.alert).toHaveBeenCalledOnce();
  });

  it("hands accepted text to the page and selects it", () => {
    const { store, cell } = renderCell(true);
    type(cell, "Total");
    expect(cell.textContent).toBe("");
    expect(store.selection.selectOne).toHaveBeenCalledWith("cell-run");
    expect(mocks.alert).not.toHaveBeenCalled();
  });
});
