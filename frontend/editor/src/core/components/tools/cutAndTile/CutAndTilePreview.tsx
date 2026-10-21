import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import styles from "@app/components/tools/cutAndTile/CutAndTilePreview.module.css";
import {
  gridDivisions,
  posterDivisions,
  type CutAndTileParameters,
} from "@app/hooks/tools/cutAndTile/useCutAndTileParameters";

interface CutAndTilePreviewProps {
  parameters: CutAndTileParameters;
}

/** A4 portrait, the shape both modes are easiest to read on. */
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;

/** Numbers stop being legible past this many cells; the grid lines still show. */
const MAX_LABELLED_CELLS = 24;

export interface Cell {
  column: number;
  row: number;
  number: number;
}

/**
 * Numbers the cells in the order the endpoint writes them, which is not reading
 * order: the section endpoint walks a column from top to bottom before moving
 * to the next one. Verified against split-pdf-by-sections output.
 */
export function gridCells(rows: number, columns: number): Cell[] {
  const cells: Cell[] = [];
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      cells.push({ column, row, number: column * rows + row + 1 });
    }
  }
  return cells;
}

/** Poster tiles run left to right, top to bottom, one row of the page at a time. */
export function posterCells(
  rows: number,
  columns: number,
  rightToLeft: boolean,
): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push({
        column: rightToLeft ? columns - 1 - column : column,
        row,
        number: row * columns + column + 1,
      });
    }
  }
  return cells;
}

export function CutAndTilePreview({
  parameters,
}: CutAndTilePreviewProps): ReactNode {
  const { t } = useTranslation();
  const poster = parameters.mode === "poster";
  const divisions = poster
    ? posterDivisions(parameters)
    : gridDivisions(parameters);
  if (!divisions) return null;

  const { rows, columns } = divisions;
  const cells = poster
    ? posterCells(rows, columns, parameters.rightToLeft)
    : gridCells(rows, columns);
  const labelled = cells.length <= MAX_LABELLED_CELLS;
  const cellWidth = PAGE_WIDTH / columns;
  const cellHeight = PAGE_HEIGHT / rows;
  const fontSize = Math.min(cellWidth, cellHeight) * 0.3;

  const caption = poster
    ? t(
        "cutAndTile.preview.posterCaption",
        "{{count}} tiles per page, in reading order. Each tile is scaled to {{size}} and centred, so margins can be blank.",
        {
          count: rows * columns,
          size: parameters.pageSize || "A4",
        },
      )
    : t(
        "cutAndTile.preview.gridCaption",
        "{{count}} pieces per page. Numbers follow the order the pieces are written: down each column, starting top left.",
        { count: rows * columns },
      );

  return (
    <figure className={styles.figure} data-testid="cut-and-tile-preview">
      {/* icon-lint-allow: runtime-generated-svg -- the grid is drawn from the chosen rows and columns */}
      <svg
        className={styles.page}
        viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
        role="img"
        aria-label={caption}
      >
        <rect
          className={styles.sheet}
          x={0.5}
          y={0.5}
          width={PAGE_WIDTH - 1}
          height={PAGE_HEIGHT - 1}
          rx={2}
        />
        {cells.map((cell) => {
          const x = cell.column * cellWidth;
          const y = cell.row * cellHeight;
          return (
            <g key={`${cell.column}-${cell.row}`}>
              <rect
                className={styles.cell}
                x={x}
                y={y}
                width={cellWidth}
                height={cellHeight}
              />
              {labelled && (
                <text
                  className={styles.cellLabel}
                  x={x + cellWidth / 2}
                  y={y + cellHeight / 2}
                  fontSize={fontSize}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {cell.number}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className={styles.caption}>{caption}</figcaption>
    </figure>
  );
}

export default CutAndTilePreview;
