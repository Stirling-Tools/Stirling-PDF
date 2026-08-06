import { type ReactNode, useMemo, useState } from "react";
import {
  type ColumnDef,
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  type RowData,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { Card } from "@app/ui/Card";
import { Skeleton } from "@app/ui/Skeleton";
import "@app/ui/DataTable.css";

/** Per-column presentation carried through TanStack's typed `meta` slot. */
export interface DataTableColumnMeta {
  align?: "left" | "right" | "center";
  width?: string;
}

/**
 * Feature registry for every DataTable. Built once, statically, per TanStack's
 * guidance. Sorting is always registered so any column can opt in per-instance
 * via `sortable`; the core (unsorted) row model is supplied by default.
 */
const DATA_TABLE_FEATURES = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnMeta: {} as DataTableColumnMeta,
});
type DataTableFeatures = typeof DATA_TABLE_FEATURES;

/** A value TanStack can order rows by. */
type SortValue = string | number | boolean | null | undefined;

interface DataTableColumnBase<T> {
  /** Stable column id. */
  key: string;
  header: ReactNode;
  /** Cell renderer for a row. */
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Optional fixed/min width (any CSS length). */
  width?: string;
}

/**
 * Column definition. `sortable` columns must supply `sortValue` (the value the
 * header sorts by), so a sortable column can never be created without one.
 */
export type DataTableColumn<T> =
  | (DataTableColumnBase<T> & { sortable?: false; sortValue?: never })
  | (DataTableColumnBase<T> & {
      sortable: true;
      sortValue: (row: T) => SortValue;
    });

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Stable key per row. */
  rowKey: (row: T) => string;

  /** Makes rows interactive (hover + click + keyboard). */
  onRowClick?: (row: T) => void;
  /**
   * Per-row gate for interactivity, checked only when {@link onRowClick} is set.
   * A row for which this returns false is inert. Defaults to all rows interactive.
   */
  isRowInteractive?: (row: T) => boolean;

  /** Initial sort, applied to the matching `sortable` column. */
  defaultSort?: { key: string; direction?: "asc" | "desc" };

  /** First-load state: renders column-shaped skeleton rows under the header. */
  loading?: boolean;
  /** Skeleton row count while loading. Defaults to 6. */
  skeletonRows?: number;
  /** Error slot — replaces the rows with an alert message row. */
  error?: ReactNode;
  /** Shown when there are no rows (and not loading / no error). Text or a node. */
  empty?: ReactNode;

  /** Wrap in a Card surface. Defaults to true. Set false to render bare. */
  card?: boolean;
  /** Content above the table (filters, search, actions), inside the surface. */
  toolbar?: ReactNode;
  /** Sticky header while the body scrolls. */
  stickyHeader?: boolean;
  /** Row density. */
  density?: "comfortable" | "compact";
  className?: string;
  /** Accessible caption for the table. */
  caption?: string;
}

function SortGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 8 6 15h12z" />
    </svg>
  );
}

/**
 * Shared data table. A friendly column API (columns own their cell renderers)
 * on top of a TanStack v9 engine, with loading / empty / error, optional
 * sorting, sticky headers, a toolbar slot, and a Card surface all standardized
 * in one place. Rows become focusable buttons-in-disguise when `onRowClick` is
 * set — matching the presentational `Table` it supersedes.
 */
export function DataTable<T extends RowData>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isRowInteractive,
  defaultSort,
  loading = false,
  skeletonRows = 6,
  error,
  empty,
  card = true,
  toolbar,
  stickyHeader = false,
  density = "comfortable",
  className,
  caption,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(
    defaultSort
      ? [{ id: defaultSort.key, desc: defaultSort.direction === "desc" }]
      : [],
  );

  const tanstackColumns = useMemo<ColumnDef<DataTableFeatures, T>[]>(() => {
    const helper = createColumnHelper<DataTableFeatures, T>();
    return columns.map((column) => {
      const meta: DataTableColumnMeta = {
        align: column.align,
        width: column.width,
      };
      if (column.sortable) {
        // Return `unknown` so every column shares one TValue; a mixed-TValue
        // array isn't assignable to ColumnDef<_, T>[]. Sorting reads the value
        // at runtime, so the widened type is harmless.
        return helper.accessor((row: T): unknown => column.sortValue(row), {
          id: column.key,
          header: () => column.header,
          cell: (ctx) => column.render(ctx.row.original),
          enableSorting: true,
          sortUndefined: "last",
          meta,
        });
      }
      return helper.display({
        id: column.key,
        header: () => column.header,
        cell: (ctx) => column.render(ctx.row.original),
        meta,
      });
    });
  }, [columns]);

  const table = useTable({
    features: DATA_TABLE_FEATURES,
    data: rows,
    columns: tanstackColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => rowKey(row),
  });

  const interactive = Boolean(onRowClick);
  const colCount = columns.length;

  let body: ReactNode;
  if (loading) {
    body = Array.from({ length: skeletonRows }).map((_, r) => (
      <tr key={`skeleton-${r}`} className="sui-datatable__row">
        {columns.map((column) => (
          <td
            key={column.key}
            className={`sui-datatable__td sui-datatable__td--${column.align ?? "left"}`}
          >
            <Skeleton
              height="0.75rem"
              width={column.align === "right" ? "40%" : "70%"}
            />
          </td>
        ))}
      </tr>
    ));
  } else if (error != null) {
    body = (
      <tr>
        <td
          className="sui-datatable__state sui-datatable__state--error"
          colSpan={colCount}
          role="alert"
        >
          {error}
        </td>
      </tr>
    );
  } else if (rows.length === 0) {
    const isNode = typeof empty === "object" && empty !== null;
    body = (
      <tr>
        <td
          className={
            isNode
              ? "sui-datatable__state sui-datatable__state--node"
              : "sui-datatable__state"
          }
          colSpan={colCount}
        >
          {empty ?? "No data"}
        </td>
      </tr>
    );
  } else {
    body = table.getRowModel().rows.map((row) => {
      const rowInteractive =
        interactive && (isRowInteractive?.(row.original) ?? true);
      return (
        <tr
          key={row.id}
          className={
            rowInteractive
              ? "sui-datatable__row sui-datatable__row--interactive"
              : "sui-datatable__row"
          }
          onClick={rowInteractive ? () => onRowClick?.(row.original) : undefined}
          tabIndex={rowInteractive ? 0 : undefined}
          role={rowInteractive ? "button" : undefined}
          onKeyDown={
            rowInteractive
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick?.(row.original);
                  }
                }
              : undefined
          }
        >
          {row.getAllCells().map((cell) => {
            const align = cell.column.columnDef.meta?.align ?? "left";
            return (
              <td
                key={cell.id}
                className={`sui-datatable__td sui-datatable__td--${align}`}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            );
          })}
        </tr>
      );
    });
  }

  const rootClass = [
    "sui-datatable",
    card ? "sui-datatable--carded" : "sui-datatable--bare",
    `sui-datatable--${density}`,
    stickyHeader ? "sui-datatable--sticky" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const frame = (
    <div className="sui-datatable__frame">
      {toolbar && <div className="sui-datatable__toolbar">{toolbar}</div>}
      <div className="sui-datatable__scroll">
        <table className="sui-datatable__table">
          {caption && (
            <caption className="sui-datatable__caption">{caption}</caption>
          )}
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const align = header.column.columnDef.meta?.align ?? "left";
                  const width = header.column.columnDef.meta?.width;
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const label = header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      );
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={`sui-datatable__th sui-datatable__th--${align}`}
                      style={width ? { width } : undefined}
                      aria-sort={
                        canSort
                          ? sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : "none"
                          : undefined
                      }
                    >
                      {canSort ? (
                        <button
                          type="button"
                          className="sui-datatable__sort"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {label}
                          <span
                            className={`sui-datatable__sort-icon sui-datatable__sort-icon--${sorted || "none"}`}
                          >
                            <SortGlyph />
                          </span>
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
    </div>
  );

  const content = <div className={rootClass}>{frame}</div>;

  return card ? (
    <Card padding="none" className="sui-datatable__card">
      {content}
    </Card>
  ) : (
    content
  );
}
