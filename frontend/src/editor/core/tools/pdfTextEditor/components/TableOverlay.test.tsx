import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TableOverlay } from "@editor/tools/pdfTextEditor/components/TableOverlay";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type {
  PageSnapshot,
  TableSnapshot,
  TextRunSnapshot,
} from "@editor/tools/pdfTextEditor/types";

const mocks = vi.hoisted(() => ({
  drawable: true,
  alert: vi.fn(),
  detected: [] as unknown[],
}));
vi.mock("@editor/tools/pdfTextEditor/util/tableDetection", () => ({
  detectTables: () => mocks.detected,
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

const RECOGNIZED: TableSnapshot = {
  ...TABLE,
  id: "r1",
  rows: 2,
  cols: 2,
  colEdges: [100, 200, 300],
  rowEdges: [500, 480, 460],
  cells: [
    {
      row: 0,
      col: 0,
      rect: { x: 100, y: 480, width: 100, height: 20 },
      runIds: ["cell-a"],
      colSpan: 1,
      rowSpan: 1,
    },
  ],
  synthetic: false,
  ruled: false,
};

function renderRecognized(selectedRunIds: string[] = []) {
  mocks.detected = [RECOGNIZED];
  const store = { adoptTable: vi.fn(), selection: { selectMany: vi.fn() } };
  const view = render(
    <MantineProvider env="test">
      <div data-testid="layer">
        <TableOverlay
          page={{ ...PAGE, tables: [] }}
          transform={DisplayTransform.identity(612, 792)}
          scale={1}
          store={store as unknown as EditorStore}
          selectedRunIds={selectedRunIds}
        />
      </div>
    </MantineProvider>,
  );
  const box = screen.getByTestId("pdf-editor-recognized-table-r1");
  box.getBoundingClientRect = () => new DOMRect(100, 292, 200, 40);
  return {
    store,
    view,
    box,
    chip: screen.getByTestId("pdf-editor-recognized-table-chip-r1"),
  };
}

function pointerAt(x: number, y: number): void {
  fireEvent(
    screen.getByTestId("layer"),
    new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true }),
  );
}

describe("a recognized table", () => {
  beforeEach(() => {
    mocks.detected = [];
  });

  it("draws nothing over the page until the pointer reaches it", () => {
    const { box, chip } = renderRecognized();
    expect(box.dataset.shown).toBe("false");
    expect(box.style.border).toBe("1px solid transparent");
    expect(chip.dataset.shown).toBe("false");
    expect(box.querySelectorAll("[style*='border-left']")).toHaveLength(0);
  });

  it("shows a dotted outline and one chip on hover, without a grid", () => {
    const { box, chip } = renderRecognized();
    pointerAt(150, 300);
    expect(box.dataset.shown).toBe("true");
    expect(box.style.border).toContain("dotted");
    expect(box.style.border).toContain("--c-accent-fg");
    expect(chip.dataset.shown).toBe("true");
    expect(box.querySelectorAll("[style*='border-left']")).toHaveLength(0);
    expect(box.querySelectorAll("[style*='border-top']")).toHaveLength(0);
    pointerAt(500, 700);
    expect(chip.dataset.shown).toBe("false");
  });

  it("shows its chip while any of its text is selected", () => {
    const { chip } = renderRecognized(["cell-a"]);
    expect(chip.dataset.shown).toBe("true");
  });

  it("keeps the chip reachable from the keyboard while hidden", () => {
    const { store } = renderRecognized();
    const edit = screen.getByTestId("pdf-editor-recognized-table-edit-r1");
    edit.focus();
    expect(document.activeElement).toBe(edit);
    fireEvent.click(edit);
    expect(store.adoptTable).toHaveBeenCalledWith(RECOGNIZED);
    fireEvent.click(
      screen.getByTestId("pdf-editor-recognized-table-select-r1"),
    );
    expect(store.selection.selectMany).toHaveBeenCalledWith(["cell-a"]);
  });
});

function textRun(id: string, y: number, x = 100, width = 150): TextRunSnapshot {
  return {
    id,
    text: id,
    bounds: { x, y, width, height: 14 },
  } as unknown as TextRunSnapshot;
}

function renderEditing(runs: TextRunSnapshot[]) {
  const table: TableSnapshot = {
    ...TABLE,
    rows: 2,
    cols: 2,
    colEdges: [100, 200, 300],
    rowEdges: [500, 480, 460],
    ruled: false,
  };
  render(
    <MantineProvider env="test">
      <TableOverlay
        page={{ ...PAGE, runs, tables: [table] }}
        transform={DisplayTransform.identity(612, 792)}
        scale={1}
        store={{} as unknown as EditorStore}
      />
    </MantineProvider>,
  );
  return {
    frame: screen.getByTestId("pdf-editor-table-t1"),
    toolbar: screen.getByTestId("pdf-editor-table-controls-t1"),
  };
}

describe("a table being edited", () => {
  it("draws a dotted edge around a cell grid of solid lines", () => {
    const { frame } = renderEditing([]);
    expect(frame.style.border).toContain("dotted");
    const lines = frame.querySelectorAll<HTMLElement>(
      "[style*='border-left'], [style*='border-top']",
    );
    expect(lines.length).toBe(2);
    for (const line of lines)
      expect(line.getAttribute("style")).toMatch(/solid/);
  });

  it("puts its toolbar above the table when nothing is there", () => {
    const { toolbar } = renderEditing([textRun("far", 700)]);
    expect(toolbar.dataset.placement).toBe("above");
    expect(parseFloat(toolbar.style.top)).toBeLessThan(292);
  });

  it("moves its toolbar below the table rather than over the text above it", () => {
    const { toolbar } = renderEditing([textRun("heading", 505)]);
    expect(toolbar.dataset.placement).toBe("below");
    expect(parseFloat(toolbar.style.top)).toBeGreaterThan(332);
  });

  it("tries the other end of the edge before covering text", () => {
    const { toolbar } = renderEditing([
      textRun("aside", 505, 330, 40),
      textRun("note", 420, 100, 40),
    ]);
    expect(toolbar.dataset.placement).toBe("above");
    expect(parseFloat(toolbar.style.left)).toBeLessThan(99);
  });
});
