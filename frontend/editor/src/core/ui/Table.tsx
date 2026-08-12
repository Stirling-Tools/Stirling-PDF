import type { ReactNode } from "react";
import "@app/ui/Table.css";

export interface TableColumn<T> {
  /** Stable column id. */
  key: string;
  header: ReactNode;
  /**
   * Hides the header visually but keeps it for assistive tech. For a trailing column of controls
   * or chevrons, where a visible heading would be noise but a blank one leaves the cells below it
   * unlabelled.
   */
  headerHidden?: boolean;
  /** Cell renderer for a row. */
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Optional fixed/min width (any CSS length). */
  width?: string;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  /** Stable key per row. */
  rowKey: (row: T) => string;
  /** Makes rows interactive (hover + click + keyboard). */
  onRowClick?: (row: T) => void;
  /**
   * Per-row gate for interactivity, checked only when {@link onRowClick} is set. A row for which
   * this returns false is inert: no click/keyboard, and not announced as a button. Defaults to
   * all rows interactive.
   */
  isRowInteractive?: (row: T) => boolean;
  /**
   * Set when rows render controls of their own. The row keeps its click as a mouse shortcut but
   * stops announcing itself as a button, because a button may not contain other controls and a
   * {@code <tr role="button">} is no longer a row to a screen reader. That row control is then the
   * keyboard path to the same action, so nothing is lost by leaving the row itself inert.
   */
  rowsContainControls?: boolean;
  /** Rendered in place of the body when there are no rows. */
  empty?: ReactNode;
  className?: string;
}

/**
 * Minimal data table primitive. Columns own their own cell renderers, so the
 * table stays presentational — callers pre-sort/filter and pass the rows they
 * want shown. Rows become focusable buttons-in-disguise when `onRowClick` is
 * set.
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isRowInteractive,
  rowsContainControls = false,
  empty,
  className,
}: TableProps<T>) {
  const interactive = Boolean(onRowClick);
  return (
    <div
      className={["sui-table-wrap", className ?? ""].filter(Boolean).join(" ")}
    >
      <table className="sui-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`sui-table__th sui-table__th--${c.align ?? "left"}`}
                style={c.width ? { width: c.width } : undefined}
              >
                {c.headerHidden ? (
                  <span className="sui-table__th-sr">{c.header}</span>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="sui-table__empty" colSpan={columns.length}>
                {empty ?? "No data"}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const rowInteractive =
                interactive && (isRowInteractive?.(row) ?? true);
              // Only a row that owns the whole interaction takes the button role and the keyboard
              // handling that goes with it; see rowsContainControls.
              const rowIsControl = rowInteractive && !rowsContainControls;
              return (
                <tr
                  key={rowKey(row)}
                  className={
                    rowInteractive
                      ? "sui-table__row sui-table__row--interactive"
                      : "sui-table__row"
                  }
                  onClick={rowInteractive ? () => onRowClick?.(row) : undefined}
                  tabIndex={rowIsControl ? 0 : undefined}
                  role={rowIsControl ? "button" : undefined}
                  onKeyDown={
                    rowIsControl
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick?.(row);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`sui-table__td sui-table__td--${c.align ?? "left"}`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
