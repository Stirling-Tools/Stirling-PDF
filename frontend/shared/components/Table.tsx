import type { ReactNode } from "react";
import "@shared/components/Table.css";

export interface TableColumn<T> {
  /** Stable column id. */
  key: string;
  header: ReactNode;
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
                {c.header}
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
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={
                  interactive
                    ? "sui-table__row sui-table__row--interactive"
                    : "sui-table__row"
                }
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={interactive ? 0 : undefined}
                role={interactive ? "button" : undefined}
                onKeyDown={
                  interactive
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
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
