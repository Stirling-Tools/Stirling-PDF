import { Fragment, type ReactNode } from "react";
import { StatusBadge, type StatusTone } from "@app/ui/StatusBadge";
import { Chip, type ChipAccent } from "@app/ui/Chip";
import { Button } from "@app/ui/Button";
import { Dropdown } from "@app/ui/Dropdown";
import { ProgressBar } from "@app/ui/ProgressBar";
import { Select, type SelectOption } from "@app/ui/Select";

/**
 * The column vocabulary for {@link DataTable}. Call-sites pick a cell KIND and
 * supply the data + semantics; the component owns 100% of the appearance. There
 * is no raw-JSX / className escape hatch by design; a cell can only look the way
 * the design system draws its kind, so every table looks and behaves the same.
 */

type Align = "left" | "right";
type SortValue = string | number | boolean | null | undefined;

/**
 * Which built-in comparator sorts a column. Set by the builder from the cell's
 * data type - `alphanumeric` (case-insensitive, natural: `v2` before `v10`) for
 * text, `basic` (raw numeric) for numbers. Call-sites never choose this.
 */
export type DataTableSortFn = "alphanumeric" | "basic";

/** Opaque, fully-resolved column. Produced only by the {@link column} builders. */
export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  align: Align;
  /** Prevent wrapping (mono/number values). */
  nowrap: boolean;
  /** Shrink the column to its content (actions / affordances). */
  fit: boolean;
  sortable: boolean;
  sortValue?: (row: T) => SortValue;
  /** Comparator kind, derived from the cell type. Only set when sortable. */
  sortFn?: DataTableSortFn;
  /** Internal, design-system-owned renderer. Call-sites never supply this. */
  renderCell: (row: T) => ReactNode;
}

/** The only design-system glyph a cell may use (icon-only actions). */
export type CellGlyph = "kebab";

function KebabGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

/** An item in a kebab action menu. */
export interface CellMenuItem {
  label: string;
  tone?: "default" | "danger";
  disabled?: boolean;
  onClick: () => void;
  /** Draw a divider above this item. */
  dividerBefore?: boolean;
}

/** A row/group action. A locked button, or a kebab menu when `menu` is set. */
export interface CellAction {
  label: string;
  glyph?: CellGlyph;
  /** Icon-only (uses `label` as the accessible name). */
  iconOnly?: boolean;
  tone?: "default" | "danger";
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** When set, the button opens this menu instead of firing `onClick`. */
  menu?: CellMenuItem[];
}

/** Renders a row of locked action buttons / kebab menus. Shared by the
 *  `actions` cell kind and grouped-table headers. */
export function renderCellActions(actions: CellAction[]): ReactNode {
  return (
    <div className="sui-dtc__actions">
      {actions.map((a) =>
        a.menu ? (
          <Dropdown.Root key={a.label}>
            <Dropdown.Trigger>
              <Button
                variant={a.iconOnly ? "quiet" : "tertiary"}
                size="sm"
                shape={a.iconOnly ? "circle" : undefined}
                leftSection={a.glyph ? <KebabGlyph /> : undefined}
                aria-label={a.iconOnly ? a.label : undefined}
              >
                {a.iconOnly ? undefined : a.label}
              </Button>
            </Dropdown.Trigger>
            <Dropdown.Menu width={210}>
              {a.menu.map((m) => (
                <Fragment key={m.label}>
                  {m.dividerBefore && <Dropdown.Divider />}
                  <Dropdown.Item
                    onSelect={m.onClick}
                    disabled={m.disabled}
                    className={
                      m.tone === "danger"
                        ? "sui-dtc__menu-item--danger"
                        : undefined
                    }
                  >
                    {m.label}
                  </Dropdown.Item>
                </Fragment>
              ))}
            </Dropdown.Menu>
          </Dropdown.Root>
        ) : (
          <Button
            key={a.label}
            variant={a.iconOnly ? "quiet" : "tertiary"}
            accent={a.tone === "danger" ? "danger" : undefined}
            size="sm"
            shape={a.iconOnly ? "circle" : undefined}
            leftSection={a.glyph ? <KebabGlyph /> : undefined}
            loading={a.loading}
            disabled={a.disabled}
            aria-label={a.iconOnly ? a.label : undefined}
            onClick={(e) => {
              e.stopPropagation();
              a.onClick?.();
            }}
          >
            {a.iconOnly ? undefined : a.label}
          </Button>
        ),
      )}
    </div>
  );
}

/** An external link inside a cell. */
export interface CellLink {
  label: string;
  href: string;
  ariaLabel?: string;
}

interface Common {
  key: string;
  header: ReactNode;
  sortable?: boolean;
}

function base<T>(
  o: Common,
  extra: Pick<DataTableColumn<T>, "align" | "nowrap" | "fit" | "renderCell"> & {
    sortValue?: (row: T) => SortValue;
    sortFn?: DataTableSortFn;
  },
): DataTableColumn<T> {
  return {
    key: o.key,
    header: o.header,
    align: extra.align,
    nowrap: extra.nowrap,
    fit: extra.fit,
    sortable: !!o.sortable,
    sortValue: o.sortable ? extra.sortValue : undefined,
    sortFn: o.sortable ? extra.sortFn : undefined,
    renderCell: extra.renderCell,
  };
}

function text<T>(
  o: Common & { get: (row: T) => string; sortBy?: (row: T) => SortValue },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: false,
    fit: false,
    sortValue: o.sortBy ?? ((r) => o.get(r)),
    sortFn: "alphanumeric",
    renderCell: (r) => <span className="sui-dtc__text">{o.get(r)}</span>,
  });
}

function mono<T>(
  o: Common & { get: (row: T) => string; sortBy?: (row: T) => SortValue },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: true,
    fit: false,
    sortValue: o.sortBy ?? ((r) => o.get(r)),
    sortFn: "alphanumeric",
    renderCell: (r) => <code className="sui-dtc__mono">{o.get(r)}</code>,
  });
}

function muted<T>(
  o: Common & {
    get: (row: T) => string | null | undefined;
    placeholder?: string;
    /** Override the sort key (e.g. an ISO date behind a "3 days ago" label). */
    sortBy?: (row: T) => SortValue;
  },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: false,
    fit: false,
    sortValue: o.sortBy ?? ((r) => o.get(r) ?? undefined),
    sortFn: "alphanumeric",
    renderCell: (r) => (
      <span className="sui-dtc__muted">
        {o.get(r) || (o.placeholder ?? "-")}
      </span>
    ),
  });
}

function number<T>(
  o: Common & {
    get: (row: T) => number | null | undefined;
    format?: (n: number, row: T) => string;
    placeholder?: string;
    /** Override the sort key (e.g. a raw count behind a formatted label). */
    sortBy?: (row: T) => SortValue;
  },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "right",
    nowrap: true,
    fit: false,
    sortValue: o.sortBy ?? ((r) => o.get(r) ?? undefined),
    sortFn: "basic",
    renderCell: (r) => {
      const n = o.get(r);
      if (n == null) {
        return (
          <span className="sui-dtc__num sui-dtc__muted">
            {o.placeholder ?? "-"}
          </span>
        );
      }
      return (
        <span className="sui-dtc__num">
          {o.format ? o.format(n, r) : String(n)}
        </span>
      );
    },
  });
}

function badge<T>(
  o: Common & {
    get: (row: T) => { tone: StatusTone; label: string };
    sortBy?: (row: T) => SortValue;
  },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: true,
    fit: false,
    sortValue: o.sortBy ?? ((r) => o.get(r).label),
    sortFn: "alphanumeric",
    renderCell: (r) => {
      const b = o.get(r);
      return (
        <StatusBadge tone={b.tone} size="sm">
          {b.label}
        </StatusBadge>
      );
    },
  });
}

/**
 * A user-defined label, rendered as a dot-less pill. Use this ONLY for labels
 * that come from data / the user (e.g. a document's classification). Values from
 * a fixed set we define (types, environments, providers) are `text`, not pills.
 */
export interface CellLabel {
  label: string;
  accent?: ChipAccent;
}

function labels<T>(
  o: Common & { get: (row: T) => CellLabel[] },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: false,
    fit: false,
    sortValue: (r) => o.get(r)[0]?.label ?? undefined,
    sortFn: "alphanumeric",
    renderCell: (r) => (
      <div className="sui-dtc__labels">
        {o.get(r).map((l) => (
          <Chip
            key={l.label}
            accent={l.accent ?? "neutral"}
            size="sm"
            showDot={false}
          >
            {l.label}
          </Chip>
        ))}
      </div>
    ),
  });
}

/**
 * An interactive capability chip: click to grant, remove to revoke, dashed to
 * offer adding. A functional cell (it toggles state), distinct from static
 * `labels`.
 */
export interface CellCap {
  label: string;
  accent?: ChipAccent;
  onClick?: () => void;
  onRemove?: () => void;
  dashed?: boolean;
}

function caps<T>(
  o: Common & { get: (row: T) => CellCap[] },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: false,
    fit: false,
    renderCell: (r) => (
      <div className="sui-dtc__labels">
        {o.get(r).map((c) => (
          <Chip
            key={c.label}
            accent={c.accent ?? "neutral"}
            size="sm"
            showDot={false}
            dashed={c.dashed}
            onClick={c.onClick}
            onRemove={c.onRemove}
          >
            {c.label}
          </Chip>
        ))}
      </div>
    ),
  });
}

function entity<T>(
  o: Common & {
    /** Semantic leading icon (component owns its size + colour container). */
    icon?: (row: T) => ReactNode;
    primary: (row: T) => string;
    /** Muted inline suffix after the name, its own node (e.g. "(you)"). */
    suffix?: (row: T) => string | null | undefined;
    /** Secondary muted line under the name. */
    note?: (row: T) => string | null | undefined;
    sortBy?: (row: T) => SortValue;
  },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: false,
    fit: false,
    sortValue: o.sortBy ?? ((r) => o.primary(r)),
    sortFn: "alphanumeric",
    renderCell: (r) => {
      const icon = o.icon?.(r);
      const suffix = o.suffix?.(r);
      const note = o.note?.(r);
      return (
        <div className="sui-dtc__entity">
          {icon != null && (
            <span className="sui-dtc__entity-icon" aria-hidden>
              {icon}
            </span>
          )}
          <div className="sui-dtc__entity-body">
            <span className="sui-dtc__entity-head">
              <span className="sui-dtc__entity-name">{o.primary(r)}</span>
              {suffix && (
                <span className="sui-dtc__entity-suffix">{suffix}</span>
              )}
            </span>
            {note && <span className="sui-dtc__note">{note}</span>}
          </div>
        </div>
      );
    },
  });
}

function actions<T>(o: {
  key: string;
  header?: ReactNode;
  get: (row: T) => CellAction[];
}): DataTableColumn<T> {
  return {
    key: o.key,
    header: o.header ?? "",
    align: "right",
    nowrap: true,
    fit: true,
    sortable: false,
    renderCell: (r) => renderCellActions(o.get(r)),
  };
}

function progress<T>(
  o: Common & { get: (row: T) => { value: number; label?: string } },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: true,
    fit: false,
    sortValue: (r) => o.get(r).value,
    sortFn: "basic",
    renderCell: (r) => {
      const p = o.get(r);
      return (
        <div className="sui-dtc__progress">
          <span className="sui-dtc__progress-bar">
            <ProgressBar value={p.value} thresholded height={6} />
          </span>
          <span className="sui-dtc__progress-pct">
            {p.label ?? `${Math.round(p.value * 100)}%`}
          </span>
        </div>
      );
    },
  });
}

function links<T>(o: {
  key: string;
  header?: ReactNode;
  get: (row: T) => CellLink[];
}): DataTableColumn<T> {
  return {
    key: o.key,
    header: o.header ?? "",
    align: "right",
    nowrap: true,
    fit: true,
    sortable: false,
    renderCell: (r) => (
      <div className="sui-dtc__links">
        {o.get(r).map((l) => (
          <a
            key={l.label}
            className="sui-dtc__link"
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={l.ariaLabel}
          >
            {l.label}
          </a>
        ))}
      </div>
    ),
  };
}

function select<T>(o: {
  key: string;
  header: ReactNode;
  get: (row: T) => {
    value?: string | null;
    defaultValue?: string;
    options: SelectOption[];
    ariaLabel?: string;
    disabled?: boolean;
  };
  /** Omit for an uncontrolled select (local UI state only). */
  onChange?: (row: T, value: string | null) => void;
}): DataTableColumn<T> {
  return {
    key: o.key,
    header: o.header,
    align: "left",
    nowrap: true,
    fit: false,
    sortable: false,
    renderCell: (r) => {
      const s = o.get(r);
      const change = o.onChange;
      return (
        <div className="sui-dtc__select">
          <Select
            options={s.options}
            value={s.value}
            defaultValue={s.defaultValue}
            onChange={change ? (v) => change(r, v) : undefined}
            aria-label={s.ariaLabel}
            disabled={s.disabled}
            inputSize="sm"
          />
        </div>
      );
    },
  };
}

/**
 * The DataTable column vocabulary. Each builder produces a locked-appearance
 * column; call-sites choose the kind + supply data, never styling.
 */
export const column = {
  text,
  mono,
  muted,
  number,
  badge,
  labels,
  caps,
  entity,
  actions,
  progress,
  links,
  select,
};
