import { type ReactNode, useMemo, useState } from "react";
import {
  type ColumnDef,
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  type RowData,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@app/ui/Skeleton";
import { Tabs } from "@app/ui/Tabs";
import {
  type CellAction,
  type DataTableColumn,
  renderCellActions,
} from "@app/ui/dataTableColumns";
import "@app/ui/DataTable.css";

export * from "@app/ui/dataTableColumns";

/** Per-column presentation carried through TanStack's typed `meta` slot. */
interface ColumnMeta {
  align: "left" | "right";
  nowrap: boolean;
  fit: boolean;
  /** Visually-hidden header text for blank affordance/action columns, so the
   *  column still has an accessible name (avoids axe `empty-table-header`). */
  srHeader?: string;
}

/**
 * Feature registry for every DataTable, built once. Sorting is always
 * registered so any column can opt in; the core row model defaults in.
 */
const DATA_TABLE_FEATURES = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnMeta: {} as ColumnMeta,
  // Register the comparators the column vocabulary uses. Without this v9 falls
  // back to a case-sensitive `basic` sort and warns per column.
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});
type DataTableFeatures = typeof DATA_TABLE_FEATURES;

/** Closed appearance dial — the only look choice a call-site may make. */
export type DataTableVariant = "default" | "compact";

/**
 * A collapsible section of rows under a locked header. Group headers are
 * structured (title + muted meta + optional right-aligned actions), never raw
 * markup, so grouped tables stay as opinionated as flat ones. Provide `groups`
 * instead of `rows`.
 */
export interface DataTableGroup<T> {
  key: string;
  title: string;
  /** Muted sub-text on the header (e.g. "5 people · led by Dana"). */
  meta?: string;
  /** Right-aligned header actions (e.g. "Add to team", a kebab menu). */
  actions?: CellAction[];
  rows: T[];
  /** Collapse rows past this count behind a "Show all N" toggle. */
  collapseAfter?: number;
}

/**
 * A declarative row filter. DataTable renders the options as a pill control,
 * owns the active value, and applies `predicate` to every row. Supply the
 * reset / "all" option yourself (usually first) and return true for it.
 */
export interface DataTableFilter<T> {
  key: string;
  options: { value: string; label: string; count?: number }[];
  /** Keep the row when it returns true for the active value. */
  predicate: (row: T, value: string) => boolean;
  /** Active value on first render. Defaults to the first option. */
  defaultValue?: string;
  ariaLabel?: string;
}

export interface DataTableProps<T> {
  /** Columns built with the `column` vocabulary — never raw JSX. */
  columns: DataTableColumn<T>[];
  /** Flat rows. Provide this OR `groups`, not both. */
  rows?: T[];
  /** Grouped rows with section headers. Takes precedence over `rows`. */
  groups?: DataTableGroup<T>[];
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
  /** Shown when filters exclude every row (rows exist, none match). Falls back
   *  to `empty`. */
  emptyFiltered?: ReactNode;

  /** Declarative filters, rendered as pill controls above the table. */
  filters?: DataTableFilter<T>[];

  /** Content above the table (filters, search, actions), inside the surface. */
  toolbar?: ReactNode;
  /** The only appearance choice. */
  variant?: DataTableVariant;
  /** Accessible caption for the table. */
  caption?: string;
  /** Labels for a group's "show all / show less" toggle (pass translated).
   *  `showAll` receives the group's total row count. */
  collapseLabels?: { showAll: (total: number) => string; showLess: string };
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
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
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
  rows = [],
  groups,
  rowKey,
  onRowClick,
  isRowInteractive,
  rowAffordance = "none",
  defaultSort,
  loading = false,
  skeletonRows = 6,
  error,
  empty,
  emptyFiltered,
  filters,
  toolbar,
  variant = "default",
  caption,
  collapseLabels = {
    showAll: (n) => `Show all ${n}`,
    showLess: "Show less",
  },
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>(
    defaultSort
      ? [{ id: defaultSort.key, desc: defaultSort.direction === "desc" }]
      : [],
  );
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const hasFilters = (filters?.length ?? 0) > 0;
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const filterValue = (f: DataTableFilter<T>) =>
    filterValues[f.key] ?? f.defaultValue ?? f.options[0]?.value ?? "";
  const passesFilters = (row: T) =>
    !filters || filters.every((f) => f.predicate(row, filterValue(f)));

  // The data source is either grouped or flat. The flat path feeds TanStack
  // (headers + sorting) its rows post-filter; the grouped path filters within
  // each section below.
  const tableData = useMemo(
    () => {
      const src = groups ? groups.flatMap((g) => g.rows) : rows;
      if (!filters || filters.length === 0) return src;
      return src.filter((row) =>
        filters.every((f) => {
          const v =
            filterValues[f.key] ?? f.defaultValue ?? f.options[0]?.value ?? "";
          return f.predicate(row, v);
        }),
      );
    },
    // filterValue is derived from filterValues; inlined above to keep deps exact.
    [groups, rows, filters, filterValues],
  );

  const interactive = Boolean(onRowClick);
  const showChevron = interactive && rowAffordance === "chevron";
  // A row that holds its own controls (actions/links/select/caps) can't also be
  // a `role="button"` (a button may not contain interactive descendants); it
  // keeps the click as a mouse shortcut, and the inner control is the keyboard path.
  const rowsContainControls = columns.some((c) => c.interactive);

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
        renderCell: (row) =>
          (isRowInteractive?.(row) ?? true) ? (
            <span className="sui-datatable__chevron" aria-hidden>
              <ChevronGlyph />
            </span>
          ) : null,
      },
    ];
  }, [columns, showChevron, isRowInteractive]);

  const tanstackColumns = useMemo<ColumnDef<DataTableFeatures, T>[]>(() => {
    const helper = createColumnHelper<DataTableFeatures, T>();
    return effectiveColumns.map((c) => {
      // A blank header (trailing affordance/action columns) still needs an
      // accessible name for assistive tech.
      const srHeader = c.header
        ? undefined
        : c.key === CHEVRON_COLUMN_KEY
          ? t("common.open", "Open")
          : t("common.actions", "Actions");
      const meta: ColumnMeta = {
        align: c.align,
        nowrap: c.nowrap,
        fit: c.fit,
        srHeader,
      };
      if (c.sortable && c.sortValue) {
        const sortValue = c.sortValue;
        return helper.accessor((row: T): unknown => sortValue(row), {
          id: c.key,
          header: () => c.header,
          cell: (ctx) => c.renderCell(ctx.row.original),
          enableSorting: true,
          sortUndefined: "last",
          sortFn: c.sortFn ?? "basic",
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
  }, [effectiveColumns, t]);

  const table = useTable({
    features: DATA_TABLE_FEATURES,
    data: tableData,
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
          <td key={c.key} className={cellClass(c.align, c.nowrap, c.fit)}>
            <Skeleton
              height="0.75rem"
              width={c.align === "right" || c.fit ? "40%" : "70%"}
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
  } else if (groups) {
    body = groups
      .map((g) => ({
        g,
        gRows: hasFilters ? g.rows.filter(passesFilters) : g.rows,
      }))
      .filter((e) => e.gRows.length > 0)
      .flatMap(({ g, gRows }) => {
        const limit = g.collapseAfter ?? Infinity;
        const open = openGroups.has(g.key);
        const overflow = gRows.length > limit;
        const shown = overflow && !open ? gRows.slice(0, limit) : gRows;
        const header = (
          <tr key={`group-${g.key}`} className="sui-datatable__group">
            <td colSpan={colCount} className="sui-datatable__group-cell">
              <div className="sui-datatable__group-head">
                <div className="sui-datatable__group-title">
                  <strong>{g.title}</strong>
                  {g.meta && (
                    <span className="sui-datatable__group-meta">{g.meta}</span>
                  )}
                </div>
                {g.actions &&
                  g.actions.length > 0 &&
                  renderCellActions(g.actions)}
              </div>
            </td>
          </tr>
        );
        const rowEls = shown.map((row) => (
          <tr key={rowKey(row)} className="sui-datatable__row">
            {columns.map((c) => (
              <td key={c.key} className={cellClass(c.align, c.nowrap, c.fit)}>
                {c.renderCell(row)}
              </td>
            ))}
          </tr>
        ));
        const moreEl = overflow ? (
          <tr key={`more-${g.key}`}>
            <td colSpan={colCount} className="sui-datatable__group-more">
              <button
                type="button"
                className="sui-datatable__show-all"
                onClick={() => toggleGroup(g.key)}
              >
                {open
                  ? collapseLabels.showLess
                  : collapseLabels.showAll(gRows.length)}
              </button>
            </td>
          </tr>
        ) : null;
        return moreEl ? [header, ...rowEls, moreEl] : [header, ...rowEls];
      });
  } else if (tableData.length === 0) {
    // Flat path only (grouped handled above). Rows present but none match the
    // active filters -> the filtered-empty slot; otherwise the plain empty one.
    const filteredOut = hasFilters && rows.length > 0;
    const content =
      (filteredOut ? (emptyFiltered ?? empty) : empty) ?? "No data";
    const isNode = typeof content === "object" && content !== null;
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
          {content}
        </td>
      </tr>
    );
  } else {
    body = table.getRowModel().rows.map((row) => {
      const rowInteractive =
        interactive && (isRowInteractive?.(row.original) ?? true);
      // Only a row that owns the whole interaction takes the button role +
      // keyboard handling; a row with its own controls keeps just the mouse click.
      const asButton = rowInteractive && !rowsContainControls;
      return (
        <tr
          key={row.id}
          className={
            rowInteractive
              ? "sui-datatable__row sui-datatable__row--interactive"
              : "sui-datatable__row"
          }
          onClick={
            rowInteractive ? () => onRowClick?.(row.original) : undefined
          }
          tabIndex={asButton ? 0 : undefined}
          role={asButton ? "button" : undefined}
          onKeyDown={
            asButton
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
        {hasFilters && (
          <div className="sui-datatable__filters">
            {filters?.map((f) => (
              <Tabs
                key={f.key}
                items={f.options.map((o) => ({
                  key: o.value,
                  label: o.label,
                  count: o.count,
                }))}
                activeKey={filterValue(f)}
                onChange={(v) =>
                  setFilterValues((prev) => ({ ...prev, [f.key]: v }))
                }
                variant="pill"
                ariaLabel={f.ariaLabel}
              />
            ))}
          </div>
        )}
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
                        ) : meta?.srHeader ? (
                          <span className="sui-datatable__th-sr">
                            {meta.srHeader}
                          </span>
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

function cellClass(
  align: "left" | "right",
  nowrap: boolean,
  fit: boolean,
): string {
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
