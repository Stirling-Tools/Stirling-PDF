import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import type { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type {
  PageRect,
  PageSnapshot,
  RGBA,
  TableCellStyle,
  TableSnapshot,
} from "@editor/tools/pdfTextEditor/types";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { overlaps } from "@editor/tools/pdfTextEditor/util/tableAdoption";
import { detectTables } from "@editor/tools/pdfTextEditor/util/tableDetection";
import { ModifyTableCommand } from "@editor/tools/pdfTextEditor/commands/ModifyTableCommand";
import { FillTableCellCommand } from "@editor/tools/pdfTextEditor/commands/FillTableCellCommand";
import { cellTextDrawable } from "@editor/tools/pdfTextEditor/commands/tableHelpers";
import { alert } from "@editor/components/toast";
import type { TableResize } from "@editor/tools/pdfTextEditor/commands/ResizeTableCommand";
import { ResizeTableCommand } from "@editor/tools/pdfTextEditor/commands/ResizeTableCommand";
import { MaterialiseTableCommand } from "@editor/tools/pdfTextEditor/commands/MaterialiseTableCommand";
import { CompositeCommand } from "@editor/tools/pdfTextEditor/commands/CompositeCommand";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import {
  pageCanvas,
  sampleTableColors,
} from "@editor/tools/pdfTextEditor/util/scanSampling";
import "@editor/tools/pdfTextEditor/components/TableOverlay.css";

// Edge handles live wholly OUTSIDE the grid, in a margin strip below it
// (columns) or left of it (rows), the way a spreadsheet puts them in its
// headers. A handle laid over the grid covers the cells and swallows the clicks
// that open one for typing.
/** Depth of the margin strip the handles occupy, in CSS px. */
const MARGIN = 12;
/** Grab length of an edge handle along the edge it moves. */
const GRAB = 13;

/** Selection accent, matching the image handle's outline. */
const ACCENT = "var(--c-accent-fg)";
const OUTLINE =
  "1px dotted color-mix(in srgb, var(--c-accent-fg) 45%, transparent)";
const GRID_LINE =
  "1px solid color-mix(in srgb, var(--c-accent-fg) 25%, transparent)";
/** Reach around the table and its chip that still counts as over them, so crossing the gap between the two does not flicker the chip. */
const HOVER_SLACK = 6;
/** Gap between the table edge (or its handle strip) and the editing toolbar. */
const TOOLBAR_GAP = 6;

// The controls sit over page content, so they need to read as a floating
// toolbar rather than as loose buttons tangled in the text behind them.
const toolbarStyle: React.CSSProperties = {
  position: "absolute",
  display: "flex",
  alignItems: "center",
  gap: 2,
  padding: 2,
  background: "var(--c-surface)",
  border: "1px solid var(--c-border)",
  borderRadius: 6,
  boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
  pointerEvents: "auto",
  zIndex: 30,
  whiteSpace: "nowrap",
};

interface TableOverlayProps {
  page: PageSnapshot;
  transform: DisplayTransform;
  scale: number;
  store: EditorStore;
  /** A recognized table shows its affordances while any of its text is selected. */
  selectedRunIds?: readonly string[];
}

interface CssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Map a PDF-space rect (y-up, origin bottom-left) to CSS px, honouring the
// page's display transform (matches ImageHandle's projection).
function rectToCss(
  rect: PageRect,
  transform: DisplayTransform,
  scale: number,
  pageHeight: number,
): CssRect {
  const corners = [
    transform.apply(rect.x, rect.y),
    transform.apply(rect.x + rect.width, rect.y),
    transform.apply(rect.x, rect.y + rect.height),
    transform.apply(rect.x + rect.width, rect.y + rect.height),
  ];
  const minX = Math.min(...corners.map((c) => c.x));
  const maxX = Math.max(...corners.map((c) => c.x));
  const minY = Math.min(...corners.map((c) => c.y));
  const maxY = Math.max(...corners.map((c) => c.y));
  return {
    left: minX * scale,
    top: (pageHeight - maxY) * scale,
    width: (maxX - minX) * scale,
    height: (maxY - minY) * scale,
  };
}

/** Draws recognized + inserted tables and their editing affordances. */
export function TableOverlay({
  page,
  transform,
  scale,
  store,
  selectedRunIds = [],
}: TableOverlayProps) {
  const detected = useMemo(
    () => detectTables(page.runs, page.pageIndex, {}, page.rules ?? []),
    [page.runs, page.pageIndex, page.rules],
  );
  const synthetic = page.tables ?? [];
  // A detected table that overlaps an inserted one is the inserted one's own
  // cells being re-recognized - drop it so we don't draw two grids.
  const detectedFiltered = detected.filter(
    (d) => !synthetic.some((s) => overlaps(d.bounds, s.bounds)),
  );

  if (detectedFiltered.length === 0 && synthetic.length === 0) return null;

  return (
    <>
      {detectedFiltered.map((table) => (
        <RecognizedTable
          key={table.id}
          table={table}
          page={page}
          transform={transform}
          scale={scale}
          store={store}
          selected={table.cells.some((c) =>
            c.runIds.some((id) => selectedRunIds.includes(id)),
          )}
        />
      ))}
      {synthetic.map((table) => (
        <EditableTable
          key={table.id}
          table={table}
          page={page}
          transform={transform}
          scale={scale}
          store={store}
        />
      ))}
    </>
  );
}

// The style a cell will be written in, mirroring TableModel.styleFor for the
// snapshot the overlay renders from.
function styleForCell(
  table: TableSnapshot,
  row: number,
  col: number,
): TableCellStyle {
  const column = table.columnStyles[col] ?? null;
  if (row === 0 && table.headerStyle) {
    return { ...table.headerStyle, align: column?.align ?? "left" };
  }
  return (
    column ?? {
      family: "Helvetica",
      fontSize: 11,
      fill: { r: 0, g: 0, b: 0, a: 255 },
      align: "left",
      sourceFontId: "base14:Helvetica",
    }
  );
}

// Base-14 PostScript names map onto the browser's generic families closely
// enough for a faithful preview.
function cssFontFamily(family: string): string {
  if (/^Times/i.test(family)) return "Times New Roman, Times, serif";
  if (/^Courier/i.test(family)) return "Courier New, Courier, monospace";
  return "Helvetica, Arial, sans-serif";
}

function cssColour(fill: RGBA): string {
  return `rgba(${fill.r}, ${fill.g}, ${fill.b}, ${fill.a / 255})`;
}

function justifyFor(align: TableCellStyle["align"]): string {
  if (align === "right") return "flex-end";
  if (align === "center") return "center";
  return "flex-start";
}

// A grid recognized from ordinary text. The page is the user's document, so
// nothing is drawn over it until the pointer is over the table or its text is
// selected; the chip stays focusable while hidden and shows on keyboard focus.
// Structural edits need the tracked geometry that only inserted tables carry.
function RecognizedTable({
  table,
  page,
  transform,
  scale,
  store,
  selected,
}: {
  table: TableSnapshot;
  page: PageSnapshot;
  transform: DisplayTransform;
  scale: number;
  store: EditorStore;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const box = rectToCss(table.bounds, transform, scale, page.height);
  const runIds = table.cells.flatMap((c) => c.runIds);
  const ref = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const hovered = usePointerOver(ref, chipRef);
  const shown = hovered || selected;

  return (
    <div
      ref={ref}
      data-testid={`pdf-editor-recognized-table-${table.id}`}
      data-shown={shown}
      style={{
        position: "absolute",
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        border: shown ? OUTLINE : "1px solid transparent",
        borderRadius: 2,
        pointerEvents: "none",
        boxSizing: "border-box",
      }}
    >
      <div
        ref={chipRef}
        className="pdf-editor-table-chip"
        data-shown={shown}
        data-testid={`pdf-editor-recognized-table-chip-${table.id}`}
      >
        <Tooltip
          label={t(
            "pdfTextEditor.table.editHint",
            "Edit as a table - type in cells, add or remove rows and columns",
          )}
        >
          <button
            type="button"
            onClick={() => store.adoptTable(table)}
            data-testid={`pdf-editor-recognized-table-edit-${table.id}`}
          >
            <Icon name="table" size={13} />
            {t("pdfTextEditor.table.editTable", "Edit table")}
          </button>
        </Tooltip>
        <span className="pdf-editor-table-chip-divider" />
        <Tooltip
          label={t(
            "pdfTextEditor.table.recognizedHint",
            "Recognized table - click to select all its text",
          )}
        >
          <button
            type="button"
            onClick={() => store.selection.selectMany(runIds)}
            data-testid={`pdf-editor-recognized-table-select-${table.id}`}
          >
            {table.rows}×{table.cols}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

// Whether the pointer is over `target` or `extra`, read from the document: the
// run overlays above the table and the page canvas below it take the pointer,
// so the table's own box (pointer-events: none) never sees it.
function usePointerOver(
  target: React.RefObject<HTMLElement | null>,
  extra: React.RefObject<HTMLElement | null>,
): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const doc = target.current?.ownerDocument;
    if (!doc) return;
    const inside = (el: HTMLElement | null, x: number, y: number) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return (
        x >= r.left - HOVER_SLACK &&
        x <= r.right + HOVER_SLACK &&
        y >= r.top - HOVER_SLACK &&
        y <= r.bottom + HOVER_SLACK
      );
    };
    const onMove = (e: MouseEvent) =>
      setOver(
        inside(target.current, e.clientX, e.clientY) ||
          inside(extra.current, e.clientX, e.clientY),
      );
    const onLeave = () => setOver(false);
    doc.addEventListener("pointermove", onMove, { passive: true });
    doc.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      doc.removeEventListener("pointermove", onMove);
      doc.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [target, extra]);
  return over;
}

// Internal separators for a table, positioned relative to the outer box.
function gridLines(table: TableSnapshot, box: CssRect) {
  const w = table.bounds.width;
  const h = table.bounds.height;
  if (w <= 0 || h <= 0) return null;
  const lines: React.ReactNode[] = [];
  for (let i = 1; i < table.cols; i++) {
    const fx = (table.colEdges[i] - table.bounds.x) / w;
    lines.push(
      <div
        key={`v${i}`}
        style={{
          position: "absolute",
          left: fx * box.width,
          top: 0,
          bottom: 0,
          borderLeft: GRID_LINE,
        }}
      />,
    );
  }
  for (let i = 1; i < table.rows; i++) {
    // rowEdges descend in y; top of the box is rowEdges[0].
    const fy = (table.rowEdges[0] - table.rowEdges[i]) / h;
    lines.push(
      <div
        key={`h${i}`}
        style={{
          position: "absolute",
          top: fy * box.height,
          left: 0,
          right: 0,
          borderTop: GRID_LINE,
        }}
      />,
    );
  }
  return lines;
}

function centredIn(r: PageRect, bounds: PageRect): boolean {
  const x = r.x + r.width / 2;
  const y = r.y + r.height / 2;
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}

type ToolbarPlacement = "above" | "below";

// Above the table unless that covers text or leaves the page, then below its
// handle strip, each tried at the left edge and then the right; where every
// spot covers something, above at the left if it stays on the page.
function placeToolbar(
  box: CssRect,
  toolbar: { width: number; height: number },
  blockers: readonly CssRect[],
  pageHeightPx: number,
): { placement: ToolbarPlacement; top: number; left: number } {
  const above = box.top - toolbar.height - TOOLBAR_GAP;
  const below = box.top + box.height + MARGIN + TOOLBAR_GAP;
  const lefts = [box.left - 1, box.left + box.width + 1 - toolbar.width];
  const clear = (top: number, left: number) =>
    !blockers.some(
      (r) =>
        r.left < left + toolbar.width &&
        r.left + r.width > left &&
        r.top < top + toolbar.height &&
        r.top + r.height > top,
    );
  const aboveFits = above >= 0;
  const belowFits = below + toolbar.height <= pageHeightPx;
  const spots: Array<{ placement: ToolbarPlacement; top: number }> = [];
  if (aboveFits) spots.push({ placement: "above", top: above });
  if (belowFits) spots.push({ placement: "below", top: below });
  for (const spot of spots)
    for (const left of lefts)
      if (clear(spot.top, left)) return { ...spot, left };
  return aboveFits || !belowFits
    ? { placement: "above", top: above, left: lefts[0] }
    : { placement: "below", top: below, left: lefts[0] };
}

// An inserted table with tracked geometry: supports add/remove row & column and
// click-to-type empty cells.
function EditableTable({
  table,
  page,
  transform,
  scale,
  store,
}: {
  table: TableSnapshot;
  page: PageSnapshot;
  transform: DisplayTransform;
  scale: number;
  store: EditorStore;
}) {
  const { t } = useTranslation();
  const box = rectToCss(table.bounds, transform, scale, page.height);
  const [drag, setDrag] = useState<DragState | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  // Client-space pointer delta -> raw-PDF delta. invert() is affine, so the
  // translation cancels and the handler needs no container origin.
  const toPdfDelta = (dx: number, dy: number) => {
    const o = transform.invert(0, 0);
    const p = transform.invert(dx / scale, -dy / scale);
    return { x: p.x - o.x, y: p.y - o.y };
  };

  // A scanned table is a picture with invisible OCR text over it, so a
  // structural edit moves text nobody can see and the page looks unchanged.
  // Rebuild it as real objects first, in the SAME undo step, so one press of
  // undo puts the scan back rather than stranding a half-built table.
  const mutate = (cmd: Command): void => {
    if (!table.scanned || table.ruled) {
      store.dispatch(cmd);
      return;
    }
    const canvas = pageCanvas(page.pageIndex);
    const colors = canvas ? sampleTableColors(canvas, table, transform) : null;
    store.dispatch(
      new CompositeCommand([
        new MaterialiseTableCommand({ tableId: table.id, colors }),
        cmd,
      ]),
    );
  };

  const commitDrag = (d: DragState) => {
    const delta = toPdfDelta(d.dx, d.dy);
    let edit: TableResize;
    if (d.kind === "col") {
      const x = table.colEdges[d.index] + delta.x;
      // Alt trades width with the neighbour at a fixed table size; the plain
      // drag resizes just this column and the table grows or shrinks with it.
      edit = d.alt
        ? { kind: "col-edge", index: d.index, x }
        : { kind: "col-size", index: d.index, x };
    } else if (d.kind === "row") {
      const y = table.rowEdges[d.index] + delta.y;
      edit = d.alt
        ? { kind: "row-edge", index: d.index, y }
        : { kind: "row-size", index: d.index, y };
    } else if (d.kind === "move") {
      edit = { kind: "move", dx: delta.x, dy: delta.y };
    } else {
      edit = {
        kind: "scale",
        width: table.bounds.width + delta.x,
        height: table.bounds.height - delta.y,
      };
    }
    mutate(new ResizeTableCommand({ tableId: table.id, edit }));
  };

  const dragProps = (kind: DragState["kind"], index: number) => ({
    active: drag?.kind === kind && drag.index === index,
    onStart: (x: number, y: number, alt: boolean) => {
      origin.current = { x, y };
      setDrag({ kind, index, dx: 0, dy: 0, alt });
    },
    onMove: (x: number, y: number) => {
      const start = origin.current;
      if (!start) return;
      setDrag((prev) => ({
        kind,
        index,
        dx: x - start.x,
        dy: y - start.y,
        alt: prev?.alt ?? false,
      }));
    },
    onEnd: () => {
      if (drag && (drag.dx !== 0 || drag.dy !== 0)) commitDrag(drag);
      origin.current = null;
      setDrag(null);
    },
  });

  const modify = (op: "add-row" | "delete-row" | "add-col" | "delete-col") => {
    const index =
      op === "add-row"
        ? table.rows
        : op === "delete-row"
          ? table.rows - 1
          : op === "add-col"
            ? table.cols
            : table.cols - 1;
    if ((op === "delete-row" || op === "delete-col") && index < 1) return;
    mutate(new ModifyTableCommand({ tableId: table.id, op, index }));
  };

  const emptyCells = table.cells.filter((c) => c.runIds.length === 0);

  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarSize, setToolbarSize] = useState({ width: 260, height: 28 });
  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const next = { width: el.offsetWidth, height: el.offsetHeight };
    if (next.width === 0 || next.height === 0) return;
    setToolbarSize((prev) =>
      prev.width === next.width && prev.height === next.height ? prev : next,
    );
  });
  const ownRuns = new Set(table.cells.flatMap((c) => c.runIds));
  const blockers = page.runs
    .filter((r) => !ownRuns.has(r.id) && !centredIn(r.bounds, table.bounds))
    .map((r) => rectToCss(r.bounds, transform, scale, page.height));
  const toolbarAt = placeToolbar(
    box,
    toolbarSize,
    blockers,
    page.height * scale,
  );

  return (
    <>
      <div
        data-testid={`pdf-editor-table-${table.id}`}
        style={{
          position: "absolute",
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          pointerEvents: "none",
          boxSizing: "border-box",
          // Outline what is being edited, but only draw cell separators the
          // page does not already draw - dashes on top of printed rules are
          // just fuzz over lines the reader can already see.
          border: OUTLINE,
        }}
      >
        {!table.ruled && !table.pageRuled && gridLines(table, box)}
        {emptyCells.map((cell) => {
          const cell01 = rectToCss(cell.rect, transform, scale, page.height);
          const style = styleForCell(table, cell.row, cell.col);
          return (
            <div
              key={`c${cell.row}-${cell.col}`}
              data-testid={`pdf-editor-table-cell-${table.id}-${cell.row}-${cell.col}`}
              contentEditable
              suppressContentEditableWarning
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLElement).blur();
                }
              }}
              onBlur={(e) => {
                const input = e.currentTarget;
                const text = input.textContent?.trim() ?? "";
                if (!text) return;
                const cmd = cellTextDrawable(text)
                  ? new FillTableCellCommand({
                      tableId: table.id,
                      row: cell.row,
                      col: cell.col,
                      text,
                    })
                  : null;
                if (cmd) mutate(cmd);
                if (!cmd?.insertedRunId) {
                  alert({
                    alertType: "warning",
                    title: t(
                      "pdfTextEditor.table.cellNoGlyphs",
                      "This text has characters the table's fonts can't draw. Change or remove them to fill the cell.",
                    ),
                    expandable: false,
                  });
                  return;
                }
                input.textContent = "";
                store.selection.selectOne(cmd.insertedRunId);
              }}
              style={{
                position: "absolute",
                left: cell01.left - box.left,
                top: cell01.top - box.top,
                width: cell01.width,
                height: cell01.height,
                boxSizing: "border-box",
                padding: 2,
                // Type in the style the cell will actually be written in, so
                // what you see while typing is what the PDF ends up with.
                display: "flex",
                alignItems: "center",
                justifyContent: justifyFor(style.align),
                textAlign: style.align,
                fontFamily: cssFontFamily(style.family),
                fontWeight: /bold/i.test(style.family) ? 700 : 400,
                fontStyle: /italic|oblique/i.test(style.family)
                  ? "italic"
                  : "normal",
                fontSize: Math.max(8, style.fontSize * scale),
                color: cssColour(style.fill),
                outline: "none",
                cursor: "text",
                pointerEvents: "auto",
              }}
            />
          );
        })}

        {Array.from({ length: table.cols }, (_, i) => i + 1).map((i) => {
          const fx = (table.colEdges[i] - table.bounds.x) / table.bounds.width;
          const d = dragProps("col", i);
          return (
            <DragArea
              key={`ch${i}`}
              testid={`pdf-editor-table-col-handle-${table.id}-${i}`}
              label={t(
                "pdfTextEditor.table.resizeColumn",
                "Drag to resize this column (Alt: share with the next)",
              )}
              cursor="col-resize"
              orientation="vertical"
              offset={d.active && drag ? drag.dx : 0}
              guide={box.height}
              style={{
                left: fx * box.width - GRAB / 2,
                top: box.height,
                width: GRAB,
                height: MARGIN,
              }}
              {...d}
            />
          );
        })}

        {Array.from({ length: table.rows }, (_, i) => i + 1).map((i) => {
          const fy =
            (table.rowEdges[0] - table.rowEdges[i]) / table.bounds.height;
          const d = dragProps("row", i);
          return (
            <DragArea
              key={`rh${i}`}
              testid={`pdf-editor-table-row-handle-${table.id}-${i}`}
              label={t(
                "pdfTextEditor.table.resizeRow",
                "Drag to resize this row (Alt: share with the next)",
              )}
              cursor="row-resize"
              orientation="horizontal"
              offset={d.active && drag ? drag.dy : 0}
              guide={box.width}
              style={{
                top: fy * box.height - GRAB / 2,
                left: -MARGIN,
                width: MARGIN,
                height: GRAB,
              }}
              {...d}
            />
          );
        })}

        {drag?.kind === "move" && (
          <div
            style={{
              position: "absolute",
              left: drag.dx,
              top: drag.dy,
              width: box.width,
              height: box.height,
              border: `1px dashed ${ACCENT}`,
              pointerEvents: "none",
            }}
          />
        )}

        <DragArea
          testid={`pdf-editor-table-scale-handle-${table.id}`}
          label={t(
            "pdfTextEditor.table.resizeTable",
            "Drag to resize the whole table",
          )}
          cursor="nwse-resize"
          orientation="grip"
          offset={0}
          guide={0}
          style={{
            left: box.width + MARGIN + (drag?.kind === "scale" ? drag.dx : 0),
            top: box.height + MARGIN + (drag?.kind === "scale" ? drag.dy : 0),
            width: 11,
            height: 11,
          }}
          {...dragProps("scale", 0)}
        />

        {drag?.kind === "scale" && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: Math.max(10, box.width + drag.dx),
              height: Math.max(10, box.height + drag.dy),
              border: `1px dashed ${ACCENT}`,
              pointerEvents: "none",
            }}
          />
        )}
      </div>
      <div
        ref={toolbarRef}
        style={{ ...toolbarStyle, left: toolbarAt.left, top: toolbarAt.top }}
        data-testid={`pdf-editor-table-controls-${table.id}`}
        data-placement={toolbarAt.placement}
      >
        <DragArea
          testid={`pdf-editor-table-move-handle-${table.id}`}
          label={t(
            "pdfTextEditor.table.moveTable",
            "Drag to move the whole table",
          )}
          cursor="move"
          orientation="grip"
          offset={0}
          guide={0}
          style={{ position: "relative", zIndex: "auto" }}
          content={
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                padding: "2px 6px",
                fontSize: 11,
                lineHeight: "18px",
                color: "var(--c-text)",
              }}
            >
              <Icon name="move" size={13} />
              {t("pdfTextEditor.table.move", "Move")}
            </span>
          }
          {...dragProps("move", 0)}
        />
        <TableControl
          label={t("pdfTextEditor.table.addRow", "Add row")}
          testid={`pdf-editor-table-add-row-${table.id}`}
          icon={<Icon name="plus" size={13} />}
          text={t("pdfTextEditor.table.row", "Row")}
          onClick={() => modify("add-row")}
        />
        <TableControl
          label={t("pdfTextEditor.table.deleteRow", "Delete row")}
          testid={`pdf-editor-table-del-row-${table.id}`}
          icon={<Icon name="minus" size={13} />}
          text={t("pdfTextEditor.table.row", "Row")}
          disabled={table.rows < 2}
          onClick={() => modify("delete-row")}
        />
        <TableControl
          label={t("pdfTextEditor.table.addColumn", "Add column")}
          testid={`pdf-editor-table-add-col-${table.id}`}
          icon={<Icon name="plus" size={13} />}
          text={t("pdfTextEditor.table.column", "Col")}
          onClick={() => modify("add-col")}
        />
        <TableControl
          label={t("pdfTextEditor.table.deleteColumn", "Delete column")}
          testid={`pdf-editor-table-del-col-${table.id}`}
          icon={<Icon name="minus" size={13} />}
          text={t("pdfTextEditor.table.column", "Col")}
          disabled={table.cols < 2}
          onClick={() => modify("delete-col")}
        />
        {table.adopted && (
          <TableControl
            label={t(
              "pdfTextEditor.table.doneHint",
              "Stop editing this as a table",
            )}
            testid={`pdf-editor-table-done-${table.id}`}
            icon={<Icon name="check" size={13} />}
            text={t("pdfTextEditor.table.done", "Done")}
            onClick={() => store.releaseTable(page.pageIndex, table.id)}
          />
        )}
      </div>
    </>
  );
}

function TableControl({
  label,
  testid,
  icon,
  text,
  disabled,
  onClick,
}: {
  label: string;
  testid: string;
  icon: React.ReactNode;
  text: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        data-testid={testid}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "2px 6px",
          fontSize: 11,
          lineHeight: "18px",
          color: disabled ? "var(--c-text-muted)" : "var(--c-text)",
          background: "transparent",
          border: "none",
          borderRadius: 4,
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {icon}
        {text}
      </button>
    </Tooltip>
  );
}

interface DragState {
  kind: "col" | "row" | "scale" | "move";
  /** Alt held: make the two neighbouring tracks trade instead of resizing one. */
  alt: boolean;
  index: number;
  /** Pointer travel since the press, in CSS px. */
  dx: number;
  dy: number;
}

// Pointer-capturing grab area for one resize gesture. Draws its own indicator
// so an edge that is only a hairline in the PDF still reads as draggable.
function DragArea({
  testid,
  label,
  cursor,
  guide,
  content,
  orientation,
  offset,
  style,
  active,
  onStart,
  onMove,
  onEnd,
}: {
  testid: string;
  label: string;
  cursor: string;
  /** Length of the alignment guide drawn back across the grid while active. */
  guide: number;
  /** Rendered instead of the grip/tick, for a handle that lives in the bar. */
  content?: React.ReactNode;
  orientation: "vertical" | "horizontal" | "grip";
  offset: number;
  style: React.CSSProperties;
  active: boolean;
  onStart: (x: number, y: number, alt: boolean) => void;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
}) {
  const [hover, setHover] = useState(false);
  const lit = hover || active;
  const shift =
    orientation === "vertical"
      ? `translateX(${offset}px)`
      : `translateY(${offset}px)`;
  return (
    <div
      data-testid={testid}
      title={label}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        // The stage clears the selection on any press that reaches it.
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        onStart(e.clientX, e.clientY, e.altKey);
      }}
      onPointerMove={(e) => {
        if (active) onMove(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        onEnd();
      }}
      onPointerCancel={onEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute",
        pointerEvents: "auto",
        // Above the page's run overlays, which otherwise swallow the press.
        zIndex: 30,
        cursor,
        touchAction: "none",
        ...style,
      }}
    >
      {content ??
        (orientation === "grip" ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: lit
                ? ACCENT
                : "color-mix(in srgb, var(--c-accent-fg) 70%, transparent)",
              border: "1px solid var(--c-surface)",
              borderRadius: 2,
              boxSizing: "border-box",
            }}
          />
        ) : (
          <>
            <div
              style={{
                position: "absolute",
                ...(orientation === "vertical"
                  ? { left: GRAB / 2 - 1, top: 0, width: 2, height: "100%" }
                  : { top: GRAB / 2 - 1, left: 0, height: 2, width: "100%" }),
                transform: shift,
                background: ACCENT,
                opacity: lit ? 1 : 0.5,
              }}
            />
            {lit && (
              <div
                style={{
                  position: "absolute",
                  pointerEvents: "none",
                  ...(orientation === "vertical"
                    ? {
                        left: GRAB / 2 - 1,
                        bottom: "100%",
                        width: 2,
                        height: guide,
                      }
                    : {
                        top: GRAB / 2 - 1,
                        left: "100%",
                        height: 2,
                        width: guide,
                      }),
                  transform: shift,
                  background: ACCENT,
                }}
              />
            )}
          </>
        ))}
    </div>
  );
}
