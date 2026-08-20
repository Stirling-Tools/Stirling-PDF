import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";
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
  /** Render the group's rows greyed/disabled (non-actionable, e.g. coming-soon). */
  muted?: boolean;
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

  // The data source is either grouped or flat; TanStack (headers, sorting for
  // the flat path) is fed the flattened rows.
  const flatRows = useMemo(
    () => (groups ? groups.flatMap((g) => g.rows) : rows),
    [groups, rows],
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
    data: flatRows,
    columns: tanstackColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => rowKey(row),
  });

  const colCount = effectiveColumns.length;

  // Shared row wiring so grouped rows behave like flat ones (interactivity +
  // the affordance column) instead of being a second-class path.
  const rowProps = (original: T, muted?: boolean) => {
    const rowInteractive =
      interactive && (isRowInteractive?.(original) ?? true);
    // A row that owns the whole interaction takes the button role + keyboard
    // handling; a row with its own controls keeps just the mouse click.
    const asButton = rowInteractive && !rowsContainControls;
    return {
      className: [
        "sui-datatable__row",
        rowInteractive ? "sui-datatable__row--interactive" : "",
        muted ? "sui-datatable__row--muted" : "",
      ]
        .filter(Boolean)
        .join(" "),
      onClick: rowInteractive ? () => onRowClick?.(original) : undefined,
      tabIndex: asButton ? 0 : undefined,
      role: asButton ? ("button" as const) : undefined,
      onKeyDown: asButton
        ? (e: KeyboardEvent<HTMLTableRowElement>) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRowClick?.(original);
            }
          }
        : undefined,
    };
  };

  // No rows at all - covers a grouped table whose groups are all empty (or an
  // empty groups list), which would otherwise render a header-only table.
  const noRows = groups
    ? groups.every((g) => g.rows.length === 0)
    : rows.length === 0;

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
  } else if (noRows) {
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
  } else if (groups) {
    body = groups.flatMap((g) => {
      const limit = g.collapseAfter ?? Infinity;
      const open = openGroups.has(g.key);
      const overflow = g.rows.length > limit;
      const shown = overflow && !open ? g.rows.slice(0, limit) : g.rows;
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
        <tr
          key={rowKey(row)}
          data-row-key={rowKey(row)}
          {...rowProps(row, g.muted)}
        >
          {effectiveColumns.map((c) => (
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
                : collapseLabels.showAll(g.rows.length)}
            </button>
          </td>
        </tr>
      ) : null;
      return moreEl ? [header, ...rowEls, moreEl] : [header, ...rowEls];
    });
  } else {
    body = table.getRowModel().rows.map((row) => (
      <tr key={row.id} data-row-key={row.id} {...rowProps(row.original)}>
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
    ));
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
