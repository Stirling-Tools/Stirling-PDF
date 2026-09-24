import {
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { Icon } from "@app/ui/Icon";
import {
  type ColumnDef,
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  type Header,
  type HeaderGroup,
  type Row,
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

interface CollapseLabels {
  showAll: (total: number) => string;
  showLess: string;
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
  collapseLabels?: CollapseLabels;
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

type RowPropsFn<T> = (
  original: T,
  muted?: boolean,
) => HTMLAttributes<HTMLTableRowElement>;

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
              <Icon name="chevron-right" size={16} />
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

  // Shared row wiring so grouped rows behave like flat ones (interactivity +
  // the affordance column) instead of being a second-class path.
  const rowProps: RowPropsFn<T> = (original, muted) => {
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

  return (
    <div className={`sui-datatable sui-datatable--${variant}`}>
      <div className="sui-datatable__frame">
        <DataTableToolbar toolbar={toolbar} />
        <div className="sui-datatable__scroll">
          <table className="sui-datatable__table">
            <DataTableCaption caption={caption} />
            <DataTableHead headerGroups={table.getHeaderGroups()} />
            <tbody>
              <BodyRows
                columns={effectiveColumns}
                sortedRows={table.getRowModel().rows}
                groups={groups}
                loading={loading}
                skeletonRows={skeletonRows}
                error={error}
                empty={empty}
                rowKey={rowKey}
                rowProps={rowProps}
                openGroups={openGroups}
                onToggleGroup={toggleGroup}
                collapseLabels={collapseLabels}
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DataTableToolbar({ toolbar }: { toolbar: ReactNode }) {
  if (!toolbar) return null;
  return <div className="sui-datatable__toolbar">{toolbar}</div>;
}

function DataTableCaption({ caption }: { caption?: string }) {
  if (!caption) return null;
  return <caption className="sui-datatable__caption">{caption}</caption>;
}

function DataTableHead<T extends RowData>({
  headerGroups,
}: {
  headerGroups: HeaderGroup<DataTableFeatures, T>[];
}) {
  return (
    <thead>
      {headerGroups.map((headerGroup) => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <HeaderCell key={header.id} header={header} />
          ))}
        </tr>
      ))}
    </thead>
  );
}

function HeaderCell<T extends RowData>({
  header,
}: {
  header: Header<DataTableFeatures, T>;
}) {
  const meta = header.column.columnDef.meta;
  return (
    <th
      scope="col"
      className={headerClass(meta?.align ?? "left", meta?.fit ?? false)}
      aria-sort={ariaSort(header)}
    >
      <HeaderContent header={header} />
    </th>
  );
}

function HeaderContent<T extends RowData>({
  header,
}: {
  header: Header<DataTableFeatures, T>;
}) {
  const label = header.isPlaceholder
    ? null
    : flexRender(header.column.columnDef.header, header.getContext());
  if (header.column.getCanSort()) {
    return (
      <button
        type="button"
        className="sui-datatable__sort"
        onClick={header.column.getToggleSortingHandler()}
      >
        {label}
        <span
          className={`sui-datatable__sort-icon sui-datatable__sort-icon--${header.column.getIsSorted() || "none"}`}
        >
          <SortGlyph />
        </span>
      </button>
    );
  }
  const srHeader = header.column.columnDef.meta?.srHeader;
  if (srHeader) {
    return <span className="sui-datatable__th-sr">{srHeader}</span>;
  }
  return label;
}

function ariaSort<T extends RowData>(header: Header<DataTableFeatures, T>) {
  if (!header.column.getCanSort()) return undefined;
  const sorted = header.column.getIsSorted();
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
}

interface BodyRowsProps<T extends RowData> {
  columns: DataTableColumn<T>[];
  sortedRows: Row<DataTableFeatures, T>[];
  groups?: DataTableGroup<T>[];
  loading: boolean;
  skeletonRows: number;
  error?: ReactNode;
  empty?: ReactNode;
  rowKey: (row: T) => string;
  rowProps: RowPropsFn<T>;
  openGroups: Set<string>;
  onToggleGroup: (key: string) => void;
  collapseLabels: CollapseLabels;
}

function BodyRows<T extends RowData>({
  columns,
  sortedRows,
  groups,
  loading,
  skeletonRows,
  error,
  empty,
  rowKey,
  rowProps,
  openGroups,
  onToggleGroup,
  collapseLabels,
}: BodyRowsProps<T>) {
  // No rows at all - covers a grouped table whose groups are all empty (or an
  // empty groups list), which would otherwise render a header-only table.
  const noRows = groups
    ? groups.every((g) => g.rows.length === 0)
    : sortedRows.length === 0;

  if (loading) return <SkeletonRows count={skeletonRows} columns={columns} />;
  if (error != null)
    return <ErrorRow error={error} colCount={columns.length} />;
  if (noRows) return <EmptyRow empty={empty} colCount={columns.length} />;
  if (groups) {
    return (
      <>
        {groups.map((group) => (
          <GroupSection
            key={group.key}
            group={group}
            open={openGroups.has(group.key)}
            onToggle={() => onToggleGroup(group.key)}
            columns={columns}
            rowKey={rowKey}
            rowProps={rowProps}
            collapseLabels={collapseLabels}
          />
        ))}
      </>
    );
  }
  return <FlatRows rows={sortedRows} rowProps={rowProps} />;
}

function SkeletonRows<T>({
  count,
  columns,
}: {
  count: number;
  columns: DataTableColumn<T>[];
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, r) => (
        <tr key={`skeleton-${r}`} className="sui-datatable__row">
          {columns.map((c) => (
            <td key={c.key} className={cellClass(c.align, c.nowrap, c.fit)}>
              <Skeleton
                height="0.75rem"
                width={c.align === "right" || c.fit ? "40%" : "70%"}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function ErrorRow({ error, colCount }: { error: ReactNode; colCount: number }) {
  return (
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
}

function EmptyRow({ empty, colCount }: { empty: ReactNode; colCount: number }) {
  const isNode = typeof empty === "object" && empty !== null;
  return (
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
}

interface GroupSectionProps<T> {
  group: DataTableGroup<T>;
  open: boolean;
  onToggle: () => void;
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  rowProps: RowPropsFn<T>;
  collapseLabels: CollapseLabels;
}

function GroupSection<T>({
  group,
  open,
  onToggle,
  columns,
  rowKey,
  rowProps,
  collapseLabels,
}: GroupSectionProps<T>) {
  const limit = group.collapseAfter ?? Infinity;
  const overflow = group.rows.length > limit;
  const shown = overflow && !open ? group.rows.slice(0, limit) : group.rows;
  return (
    <>
      <GroupHeaderRow group={group} colCount={columns.length} />
      {shown.map((row) => (
        <tr
          key={rowKey(row)}
          data-row-key={rowKey(row)}
          {...rowProps(row, group.muted)}
        >
          {columns.map((c) => (
            <td key={c.key} className={cellClass(c.align, c.nowrap, c.fit)}>
              {c.renderCell(row)}
            </td>
          ))}
        </tr>
      ))}
      <GroupToggleRow
        overflow={overflow}
        open={open}
        total={group.rows.length}
        colCount={columns.length}
        labels={collapseLabels}
        onToggle={onToggle}
      />
    </>
  );
}

function GroupHeaderRow<T>({
  group,
  colCount,
}: {
  group: DataTableGroup<T>;
  colCount: number;
}) {
  return (
    <tr className="sui-datatable__group">
      <td colSpan={colCount} className="sui-datatable__group-cell">
        <div className="sui-datatable__group-head">
          <div className="sui-datatable__group-title">
            <strong>{group.title}</strong>
            <GroupMeta meta={group.meta} />
          </div>
          <GroupActions actions={group.actions} />
        </div>
      </td>
    </tr>
  );
}

function GroupMeta({ meta }: { meta?: string }) {
  if (!meta) return null;
  return <span className="sui-datatable__group-meta">{meta}</span>;
}

function GroupActions({ actions }: { actions?: CellAction[] }) {
  if (!actions || actions.length === 0) return null;
  return renderCellActions(actions);
}

interface GroupToggleRowProps {
  overflow: boolean;
  open: boolean;
  total: number;
  colCount: number;
  labels: CollapseLabels;
  onToggle: () => void;
}

function GroupToggleRow({
  overflow,
  open,
  total,
  colCount,
  labels,
  onToggle,
}: GroupToggleRowProps) {
  if (!overflow) return null;
  return (
    <tr>
      <td colSpan={colCount} className="sui-datatable__group-more">
        <button
          type="button"
          className="sui-datatable__show-all"
          onClick={onToggle}
        >
          {open ? labels.showLess : labels.showAll(total)}
        </button>
      </td>
    </tr>
  );
}

function FlatRows<T extends RowData>({
  rows,
  rowProps,
}: {
  rows: Row<DataTableFeatures, T>[];
  rowProps: RowPropsFn<T>;
}) {
  return (
    <>
      {rows.map((row) => (
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
      ))}
    </>
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
