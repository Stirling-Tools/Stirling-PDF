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
import { Skeleton } from "@app/ui/Skeleton";
import { type DataTableColumn } from "@app/ui/dataTableColumns";
import "@app/ui/DataTable.css";

export * from "@app/ui/dataTableColumns";

/** Per-column presentation carried through TanStack's typed `meta` slot. */
interface ColumnMeta {
  align: "left" | "right";
  nowrap: boolean;
  fit: boolean;
}

/**
 * Feature registry for every DataTable, built once. Sorting is always
 * registered so any column can opt in; the core row model defaults in.
 */
const DATA_TABLE_FEATURES = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnMeta: {} as ColumnMeta,
});
type DataTableFeatures = typeof DATA_TABLE_FEATURES;

/** Closed appearance dial — the only look choice a call-site may make. */
export type DataTableVariant = "default" | "compact";

export interface DataTableProps<T> {
  /** Columns built with the `column` vocabulary — never raw JSX. */
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;

  /** Makes rows interactive (hover + click + keyboard). */
  onRowClick?: (row: T) => void;
  /** Per-row interactivity gate, checked only when `onRowClick` is set. */
  isRowInteractive?: (row: T) => boolean;
  /** Trailing affordance drawn on interactive rows. */
  rowAffordance?: "none" | "chevron";

  /** Initial sort, applied to the matching sortable column. */
  defaultSort?: { key: string; direction?: "asc" | "desc" };

  /** First-load state: renders column-shaped skeleton rows under the header. */
  loading?: boolean;
  /** Skeleton row count while loading. Defaults to 6. */
  skeletonRows?: number;
  /** Error slot — replaces the rows with an alert message row. */
  error?: ReactNode;
  /** Shown when there are no rows (and not loading / no error). Text or a node. */
  empty?: ReactNode;

  /** Content above the table (filters, search, actions), inside the surface. */
  toolbar?: ReactNode;
  /** The only appearance choice. */
  variant?: DataTableVariant;
  /** Accessible caption for the table. */
  caption?: string;
}

function ChevronGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SortGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 8 6 15h12z" />
    </svg>
  );
}

const CHEVRON_COLUMN_KEY = "__affordance";

/**
 * The shared Stirling table. Call-sites supply data + behaviour; the component
 * owns 100% of the appearance. Columns come from the `column` vocabulary (typed
 * cell kinds, no raw markup), the surface / density / states are standardized
 * here, and the only look choice exposed is the closed `variant`. Behaviour -
 * sorting today, more later - is opt-in per column or via props.
 */
export function DataTable<T extends RowData>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isRowInteractive,
  rowAffordance = "none",
  defaultSort,
  loading = false,
  skeletonRows = 6,
  error,
  empty,
  toolbar,
  variant = "default",
  caption,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(
    defaultSort
      ? [{ id: defaultSort.key, desc: defaultSort.direction === "desc" }]
      : [],
  );

  const interactive = Boolean(onRowClick);
  const showChevron = interactive && rowAffordance === "chevron";

  const effectiveColumns = useMemo<DataTableColumn<T>[]>(() => {
    if (!showChevron) return columns;
    return [
      ...columns,
      {
        key: CHEVRON_COLUMN_KEY,
        header: "",
        align: "right",
        nowrap: true,
        fit: true,
        sortable: false,
        renderCell: () => (
          <span className="sui-datatable__chevron" aria-hidden>
            <ChevronGlyph />
          </span>
        ),
      },
    ];
  }, [columns, showChevron]);

  const tanstackColumns = useMemo<ColumnDef<DataTableFeatures, T>[]>(() => {
    const helper = createColumnHelper<DataTableFeatures, T>();
    return effectiveColumns.map((c) => {
      const meta: ColumnMeta = { align: c.align, nowrap: c.nowrap, fit: c.fit };
      if (c.sortable && c.sortValue) {
        const sortValue = c.sortValue;
        return helper.accessor((row: T): unknown => sortValue(row), {
          id: c.key,
          header: () => c.header,
          cell: (ctx) => c.renderCell(ctx.row.original),
          enableSorting: true,
          sortUndefined: "last",
          meta,
        });
      }
      return helper.display({
        id: c.key,
        header: () => c.header,
        cell: (ctx) => c.renderCell(ctx.row.original),
        meta,
      });
    });
  }, [effectiveColumns]);

  const table = useTable({
    features: DATA_TABLE_FEATURES,
    data: rows,
    columns: tanstackColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => rowKey(row),
  });

  const colCount = effectiveColumns.length;

  let body: ReactNode;
  if (loading) {
    body = Array.from({ length: skeletonRows }).map((_, r) => (
      <tr key={`skeleton-${r}`} className="sui-datatable__row">
        {effectiveColumns.map((c) => (
          <td
            key={c.key}
            className={cellClass(c.align, c.nowrap, c.fit)}
          >
            <Skeleton height="0.75rem" width={c.align === "right" || c.fit ? "40%" : "70%"} />
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
            const meta = cell.column.columnDef.meta;
            return (
              <td
                key={cell.id}
                className={cellClass(
                  meta?.align ?? "left",
                  meta?.nowrap ?? false,
                  meta?.fit ?? false,
                )}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            );
          })}
        </tr>
      );
    });
  }

  return (
    <div className={`sui-datatable sui-datatable--${variant}`}>
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
                    const meta = header.column.columnDef.meta;
                    const align = meta?.align ?? "left";
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
                        className={headerClass(align, meta?.fit ?? false)}
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
    </div>
  );
}

function cellClass(align: "left" | "right", nowrap: boolean, fit: boolean): string {
  return [
    "sui-datatable__td",
    `sui-datatable__td--${align}`,
    nowrap ? "sui-datatable__td--nowrap" : "",
    fit ? "sui-datatable__td--fit" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function headerClass(align: "left" | "right", fit: boolean): string {
  return [
    "sui-datatable__th",
    `sui-datatable__th--${align}`,
    fit ? "sui-datatable__th--fit" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
