import { Tabs, type TabItem } from "@app/ui/Tabs";
import { Input } from "@app/ui/Input";
import "@app/ui/TableToolbar.css";

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path
        d="m20 20-3.5-3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface TableToolbarProps<K extends string = string> {
  /** Single-select filter chips (label + count). Omit for a search-only toolbar. */
  filters?: TabItem<K>[];
  activeFilter?: K;
  onFilterChange?: (key: K) => void;
  /** Accessible label for the filter group. */
  filterAriaLabel?: string;
  search?: string;
  /** Presence of the handler is what renders the search input. */
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /**
   * Renders as the table card's own top row: bordered, top-rounded, joined to
   * an immediately following Table (whose top corners it flattens).
   */
  attached?: boolean;
  className?: string;
}

/**
 * The one search + filter grammar for every operational table: single-select
 * filter chips on the left, an always-open search on the right. Callers own
 * the filtering itself — this is presentational, like {@link Table}.
 */
export function TableToolbar<K extends string = string>({
  filters,
  activeFilter,
  onFilterChange,
  filterAriaLabel,
  search,
  onSearchChange,
  searchPlaceholder,
  attached = false,
  className,
}: TableToolbarProps<K>) {
  return (
    <div
      className={[
        "sui-table-toolbar",
        attached ? "sui-table-toolbar--attached" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {filters && filters.length > 0 && activeFilter !== undefined && (
        <Tabs<K>
          items={filters}
          activeKey={activeFilter}
          onChange={(k) => onFilterChange?.(k)}
          variant="pill"
          ariaLabel={filterAriaLabel}
        />
      )}
      {onSearchChange && (
        <Input
          className="sui-table-toolbar__search"
          inputSize="sm"
          leadingIcon={<SearchIcon />}
          value={search ?? ""}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
      )}
    </div>
  );
}
