import type { CSSProperties, ReactNode } from "react";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type { EditorViewState } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";

/**
 * Stand-ins for the editor's page, for Storybook. The selection bar, the
 * right-click menu and find place themselves by the same hooks the editor
 * renders (`data-viewer-pages`, the run and image test ids, the viewer's
 * bottom dock), so a mock page with those hooks lets them lay out for real
 * without a PDF.
 */

export const PAGE_WIDTH = 560;
export const PAGE_HEIGHT = 380;

const textStyle: CSSProperties = {
  position: "absolute",
  left: 48,
  fontSize: 15,
  color: "var(--c-text)",
  outline: "1px solid var(--c-border-subtle)",
  padding: "1px 2px",
};

/** A page with two text boxes and an image, ids r1, r2 and i1. */
export function MockPage({
  children,
  bottomBar = false,
}: {
  children?: ReactNode;
  /** Draws the viewer's page-controls dock, which find sits above. */
  bottomBar?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        minHeight: 560,
        padding: "96px 24px",
        background: "var(--c-bg)",
      }}
    >
      <div
        data-viewer-pages
        style={{
          position: "relative",
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
          margin: "0 auto",
          background: "var(--c-bg-raised)",
          border: "1px solid var(--c-border-subtle)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div
          data-testid="pdf-editor-run-r1"
          data-run-id="r1"
          style={{ ...textStyle, top: 64, fontSize: 22, fontWeight: 600 }}
        >
          Quarterly report
        </div>
        <div
          data-testid="pdf-editor-run-r2"
          data-run-id="r2"
          style={{ ...textStyle, top: 110 }}
        >
          Prepared by the finance team for the board.
        </div>
        <div
          data-testid="pdf-editor-image-i1"
          style={{
            position: "absolute",
            left: 48,
            top: 170,
            width: 180,
            height: 110,
            borderRadius: 4,
            background:
              "linear-gradient(135deg, var(--c-primary), var(--c-bg-raised))",
          }}
        />
      </div>
      {bottomBar && (
        <div
          className="pdf-viewer-toolbar-dock"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 16,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 420,
              height: 40,
              borderRadius: 8,
              background: "var(--c-bg-raised)",
              border: "1px solid var(--c-border-subtle)",
              boxShadow: "var(--shadow-md)",
            }}
          />
        </div>
      )}
      {children}
    </div>
  );
}

/** A store with no document, holding the given selection. */
export function storyStore(
  selection: { runIds?: string[]; imageIds?: string[] } = {},
): EditorStore {
  const store = new EditorStore();
  store.selection.selectMany(
    selection.runIds ?? [],
    false,
    selection.imageIds ?? [],
  );
  return store;
}

const black = { r: 0, g: 0, b: 0, a: 1 };

/** A run as the controls read it; layout-only fields are left out. */
function run(id: string, text: string, y: number, fontSize: number) {
  return {
    id,
    pageIndex: 0,
    bounds: { x: 48, y, width: text.length * fontSize * 0.5, height: fontSize },
    matrix: [1, 0, 0, 1, 48, y],
    text,
    fontId: "Helvetica",
    fontSize,
    fill: black,
    fontSubset: false,
  };
}

/**
 * The view state of a one-page document matching {@link MockPage}: runs r1
 * and r2, image i1, and with `table` a 3 by 3 table, t1, below them. With
 * `paragraph`, r2 is a two-line paragraph.
 */
export function storyState(
  store: EditorStore,
  { table = false, lockedImage = false, paragraph = false } = {},
): EditorViewState {
  const tables = table
    ? [
        {
          id: "t1",
          pageIndex: 0,
          rows: 3,
          cols: 3,
          colEdges: [260, 360, 460, 520],
          rowEdges: [110, 80, 50, 20],
          bounds: { x: 260, y: 20, width: 260, height: 90 },
          cells: [],
        },
      ]
    : [];
  const page = {
    pageIndex: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    dirty: false,
    revision: 0,
    display: DisplayTransform.identity(PAGE_WIDTH, PAGE_HEIGHT).toData(),
    runs: [
      run("r1", "Quarterly report", 290, 22),
      {
        ...run("r2", "Prepared by the finance team for the board.", 255, 15),
        // Two lines grouped into one paragraph, so it can be split back.
        paragraphLineCount: paragraph ? 2 : undefined,
      },
    ],
    images: [
      {
        id: "i1",
        pageIndex: 0,
        bounds: { x: 48, y: 100, width: 180, height: 110 },
        locked: lockedImage,
      },
    ],
    shapes: [],
    tables,
  } as unknown as PageSnapshot;
  return {
    ...store.getState(),
    hasDocument: true,
    pageCount: 1,
    pages: [page],
  };
}
