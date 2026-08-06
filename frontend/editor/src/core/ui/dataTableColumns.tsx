import type { ReactNode } from "react";
import { StatusBadge, type StatusTone } from "@app/ui/StatusBadge";
import { Chip, type ChipAccent } from "@app/ui/Chip";
import { Button } from "@app/ui/Button";
import { ProgressBar } from "@app/ui/ProgressBar";
import { Select, type SelectOption } from "@app/ui/Select";

/**
 * The column vocabulary for {@link DataTable}. Call-sites pick a cell KIND and
 * supply the data + semantics; the component owns 100% of the appearance. There
 * is no raw-JSX / className escape hatch by design; a cell can only look the
 * way the design system draws its kind, so every table looks and behaves the
 * same. Rich cells compose from the richer kinds (`entity`, `badgeText`) rather
 * than from bespoke markup.
 */

type Align = "left" | "right";
type SortValue = string | number | boolean | null | undefined;

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
  /** Internal, design-system-owned renderer. Call-sites never supply this. */
  renderCell: (row: T) => ReactNode;
}

/** A small, closed set of design-system glyphs cells may use. */
export type CellGlyph = "bolt" | "lock" | "kebab" | "external" | "download";

function Glyph({ name }: { name: CellGlyph }) {
  if (name === "bolt") {
    return (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
      </svg>
    );
  }
  if (name === "lock") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 8V6a3 3 0 1 1 6 0v3H9z" />
      </svg>
    );
  }
  if (name === "external") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
      </svg>
    );
  }
  if (name === "download") {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}

/** A chip inside a cell. Appearance is fixed; the call-site chooses tone + label. */
export interface CellChip {
  label: string;
  accent?: ChipAccent;
  glyph?: CellGlyph;
  showDot?: boolean;
}

/** A row action. Rendered as a locked button; call-sites supply intent + handler. */
export interface CellAction {
  label: string;
  glyph?: CellGlyph;
  /** Icon-only (uses `label` as the accessible name). */
  iconOnly?: boolean;
  tone?: "default" | "danger";
  onClick: () => void;
  loading?: boolean;
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
    renderCell: extra.renderCell,
  };
}

function text<T>(o: Common & { get: (row: T) => string }): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: false,
    fit: false,
    sortValue: (r) => o.get(r),
    renderCell: (r) => <span className="sui-dtc__text">{o.get(r)}</span>,
  });
}

function mono<T>(o: Common & { get: (row: T) => string }): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: true,
    fit: false,
    sortValue: (r) => o.get(r),
    renderCell: (r) => <code className="sui-dtc__mono">{o.get(r)}</code>,
  });
}

function muted<T>(
  o: Common & { get: (row: T) => string | null | undefined; placeholder?: string },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: false,
    fit: false,
    sortValue: (r) => o.get(r) ?? null,
    renderCell: (r) => (
      <span className="sui-dtc__muted">{o.get(r) || (o.placeholder ?? "-")}</span>
    ),
  });
}

function number<T>(
  o: Common & {
    get: (row: T) => number | null | undefined;
    format?: (n: number, row: T) => string;
    mutedWhenZero?: boolean;
    placeholder?: string;
  },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "right",
    nowrap: true,
    fit: false,
    sortValue: (r) => o.get(r) ?? null,
    renderCell: (r) => {
      const n = o.get(r);
      if (n == null) {
        return (
          <span className="sui-dtc__num sui-dtc__muted">
            {o.placeholder ?? "-"}
          </span>
        );
      }
      const dim = n === 0 && o.mutedWhenZero;
      return (
        <span className={dim ? "sui-dtc__num sui-dtc__muted" : "sui-dtc__num"}>
          {o.format ? o.format(n, r) : String(n)}
        </span>
      );
    },
  });
}

function badge<T>(
  o: Common & {
    get: (row: T) => { tone: StatusTone; label: string };
    /** Drop the status dot for a plain toned pill (e.g. a confidence %). */
    showDot?: boolean;
    sortBy?: (row: T) => SortValue;
  },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: true,
    fit: false,
    sortValue: o.sortBy ?? ((r) => o.get(r).label),
    renderCell: (r) => {
      const b = o.get(r);
      return (
        <StatusBadge tone={b.tone} size="sm" showDot={o.showDot}>
          {b.label}
        </StatusBadge>
      );
    },
  });
}

function badgeText<T>(
  o: Common & { get: (row: T) => { tone: StatusTone; label: string; text: string } },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: false,
    fit: false,
    sortValue: (r) => o.get(r).text,
    renderCell: (r) => {
      const b = o.get(r);
      return (
        <span className="sui-dtc__badgetext">
          <StatusBadge tone={b.tone} size="sm">
            {b.label}
          </StatusBadge>
          <span className="sui-dtc__text">{b.text}</span>
        </span>
      );
    },
  });
}

function ChipRun({ chips }: { chips: CellChip[] }) {
  return (
    <>
      {chips.map((c) => (
        <Chip
          key={c.label}
          accent={c.accent ?? "neutral"}
          size="sm"
          showDot={c.showDot}
          leadingIcon={c.glyph ? <Glyph name={c.glyph} /> : undefined}
        >
          {c.label}
        </Chip>
      ))}
    </>
  );
}

function chips<T>(o: Common & { get: (row: T) => CellChip[] }): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: false,
    fit: false,
    sortValue: (r) => o.get(r)[0]?.label ?? null,
    renderCell: (r) => (
      <div className="sui-dtc__chips">
        <ChipRun chips={o.get(r)} />
      </div>
    ),
  });
}

function entity<T>(
  o: Common & {
    /** Semantic leading icon (component owns its size + colour container). */
    icon?: (row: T) => ReactNode;
    primary: (row: T) => string;
    /** Inline chips after the name. */
    tags?: (row: T) => CellChip[];
    /** Inline marker glyphs after the name (e.g. a lock). */
    markers?: (row: T) => CellGlyph[];
    /** Secondary line under the name. */
    note?: (row: T) => string | null | undefined;
    /** Render the secondary line monospaced (ids, codes). */
    noteMono?: boolean;
    sortBy?: (row: T) => SortValue;
  },
): DataTableColumn<T> {
  return base<T>(o, {
    align: "left",
    nowrap: false,
    fit: false,
    sortValue: o.sortBy ?? ((r) => o.primary(r)),
    renderCell: (r) => {
      const icon = o.icon?.(r);
      const tags = o.tags?.(r) ?? [];
      const markers = o.markers?.(r) ?? [];
      const note = o.note?.(r);
      return (
        <div className="sui-dtc__entity">
          {icon != null && (
            <span className="sui-dtc__entity-icon" aria-hidden>
              {icon}
            </span>
          )}
          <div className="sui-dtc__entity-body">
            <div className="sui-dtc__entity-head">
              <span className="sui-dtc__entity-name">{o.primary(r)}</span>
              <ChipRun chips={tags} />
              {markers.map((m) => (
                <span key={m} className="sui-dtc__marker" aria-hidden>
                  <Glyph name={m} />
                </span>
              ))}
            </div>
            {note && (
              <span
                className={
                  o.noteMono ? "sui-dtc__note sui-dtc__note--mono" : "sui-dtc__note"
                }
              >
                {note}
              </span>
            )}
          </div>
        </div>
      );
    },
  });
}

function actions<T>(
  o: { key: string; header?: ReactNode; get: (row: T) => CellAction[] },
): DataTableColumn<T> {
  return {
    key: o.key,
    header: o.header ?? "",
    align: "right",
    nowrap: true,
    fit: true,
    sortable: false,
    renderCell: (r) => (
      <div className="sui-dtc__actions">
        {o.get(r).map((a) => (
          <Button
            key={a.label}
            variant={a.iconOnly ? "quiet" : "tertiary"}
            accent={a.tone === "danger" ? "danger" : undefined}
            size="sm"
            shape={a.iconOnly ? "circle" : undefined}
            leftSection={a.glyph ? <Glyph name={a.glyph} /> : undefined}
            loading={a.loading}
            aria-label={a.iconOnly ? a.label : undefined}
            onClick={(e) => {
              e.stopPropagation();
              a.onClick();
            }}
          >
            {a.iconOnly ? undefined : a.label}
          </Button>
        ))}
      </div>
    ),
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

/** An external link inside a cell. */
export interface CellLink {
  label: string;
  href: string;
  glyph?: CellGlyph;
  ariaLabel?: string;
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
            {l.glyph && (
              <span className="sui-dtc__link-icon" aria-hidden>
                <Glyph name={l.glyph} />
              </span>
            )}
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
            inputSize="sm"
          />
        </div>
      );
    },
  };
}

/** One of a status badge, an info chip, or a call-to-action button per row. */
export type CellStatus =
  | { kind: "badge"; tone: StatusTone; label: string }
  | { kind: "chip"; label: string; accent?: ChipAccent }
  | { kind: "action"; label: string; onClick: () => void };

function status<T>(
  o: { key: string; header: ReactNode; get: (row: T) => CellStatus },
): DataTableColumn<T> {
  return {
    key: o.key,
    header: o.header,
    align: "right",
    nowrap: true,
    fit: false,
    sortable: false,
    renderCell: (r) => {
      const s = o.get(r);
      if (s.kind === "badge") {
        return (
          <StatusBadge tone={s.tone} size="sm">
            {s.label}
          </StatusBadge>
        );
      }
      if (s.kind === "chip") {
        return (
          <Chip accent={s.accent ?? "neutral"} size="sm" showDot={false}>
            {s.label}
          </Chip>
        );
      }
      return (
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            s.onClick();
          }}
        >
          {s.label}
        </Button>
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
  badgeText,
  chips,
  entity,
  actions,
  progress,
  links,
  select,
  status,
};
