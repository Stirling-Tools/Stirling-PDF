import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { Chip } from "@app/ui/Chip";
import { Dropdown } from "@app/ui/Dropdown";
import { Input } from "@app/ui/Input";
import "@app/ui/DataTableFilterBar.css";

/** Faceted filtering for {@link DataTable}'s `toolbar` slot. Facets chain; counts answer "if I picked this next". */

/** One filterable dimension of the rows, as declared by the call-site. */
export interface DataTableFacet<T> {
  key: string;
  /** Translated facet name (dropdown trigger + chip prefix). */
  label: string;
  /** The row's value here. Null/undefined/"" means it has none. */
  getValue: (row: T) => string | null | undefined;
  /** Display label for a value. Defaults to the value itself. */
  formatValue?: (value: string) => string;
}

/** A pickable value within a facet, with how many rows it would keep. */
export interface DataTableFacetOption {
  value: string;
  label: string;
  count: number;
}

/** A facet resolved against the current rows, ready to render. */
export interface DataTableFacetView {
  key: string;
  label: string;
  options: DataTableFacetOption[];
}

export interface DataTableFilterBarProps {
  facets: DataTableFacetView[];
  /** Active picks per facet key. */
  selected: Record<string, string[]>;
  onToggle: (facetKey: string, value: string) => void;
  onClearAll: () => void;
  /** Free-text search box. Omit to render facets only. */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** Pushed to the far end of the filter row, for a control that scopes the rows. */
  trailing?: ReactNode;
}

export interface UseDataTableFiltersResult<T> {
  /** Rows surviving every active facet and the search text. */
  rows: T[];
  /** Ready-made props for a `<DataTableFilterBar/>` in the table's toolbar. */
  filterBar: DataTableFilterBarProps;
}

/** Owns one table's filter state and derives the rows, options and bar props from it. */
export function useDataTableFilters<T>({
  rows,
  facets,
  searchText,
  searchPlaceholder,
}: {
  rows: T[];
  facets: DataTableFacet<T>[];
  /** Enables the search box; returns the haystack a row is matched against. */
  searchText?: (row: T) => string;
  /** Names what the box searches. Pass translated. */
  searchPlaceholder?: string;
}): UseDataTableFiltersResult<T> {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState("");

  const derived = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesSearch = (row: T) =>
      !q || !searchText || searchText(row).toLowerCase().includes(q);
    const matchesFacet = (row: T, facet: DataTableFacet<T>) => {
      const picks = selected[facet.key];
      if (!picks || picks.length === 0) return true;
      const value = facet.getValue(row);
      return value != null && picks.includes(value);
    };

    const filtered = rows.filter(
      (row) =>
        matchesSearch(row) && facets.every((facet) => matchesFacet(row, facet)),
    );

    const views: DataTableFacetView[] = facets.map((facet) => {
      // Against the rows every OTHER facet admits, or one pick would hide its siblings.
      const admitted = rows.filter(
        (row) =>
          matchesSearch(row) &&
          facets.every((f) => f.key === facet.key || matchesFacet(row, f)),
      );
      const counts = new Map<string, number>();
      for (const row of admitted) {
        const value = facet.getValue(row);
        if (value != null && value !== "") {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
      // A picked value stays listed at zero, or it could never be unpicked.
      for (const value of selected[facet.key] ?? []) {
        if (!counts.has(value)) counts.set(value, 0);
      }
      const format = facet.formatValue ?? ((value: string) => value);
      const options = [...counts.entries()]
        .map(([value, count]) => ({ value, label: format(value), count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      return { key: facet.key, label: facet.label, options };
    });

    return { filtered, views };
  }, [rows, facets, selected, query, searchText]);

  const onToggle = (facetKey: string, value: string) =>
    setSelected((prev) => {
      const current = prev[facetKey] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [facetKey]: next };
    });

  return {
    rows: derived.filtered,
    filterBar: {
      facets: derived.views,
      selected,
      onToggle,
      onClearAll: () => setSelected({}),
      search: searchText
        ? { value: query, onChange: setQuery, placeholder: searchPlaceholder }
        : undefined,
    },
  };
}

function SearchGlyph() {
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

function CaretGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m4.5 12.5 5 5 10-11"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The bar itself. State and derivation come from {@link useDataTableFilters}. */
export function DataTableFilterBar({
  facets,
  selected,
  onToggle,
  onClearAll,
  search,
  trailing,
}: DataTableFilterBarProps) {
  const { t } = useTranslation();

  // Every active pick, labelled for the chip row.
  const active = facets.flatMap((facet) =>
    (selected[facet.key] ?? []).map((value) => ({
      facet,
      value,
      label:
        facet.options.find((option) => option.value === value)?.label ?? value,
    })),
  );

  return (
    <div className="sui-dtfb">
      <div className="sui-dtfb__row">
        {search && (
          <Input
            className="sui-dtfb__search"
            inputSize="sm"
            leadingIcon={<SearchGlyph />}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? t("common.search", "Search")}
            aria-label={search.placeholder ?? t("common.search", "Search")}
          />
        )}
        {facets.map((facet) => {
          const picked = selected[facet.key] ?? [];
          return (
            <Dropdown.Root key={facet.key} align="start">
              <Dropdown.Trigger>
                <Button
                  variant="secondary"
                  size="sm"
                  className={
                    picked.length > 0
                      ? "sui-dtfb__facet sui-dtfb__facet--active"
                      : "sui-dtfb__facet"
                  }
                  rightSection={<CaretGlyph />}
                >
                  {facet.label}
                  {picked.length > 0 && (
                    <span className="sui-dtfb__facet-count">
                      {picked.length}
                    </span>
                  )}
                </Button>
              </Dropdown.Trigger>
              <Dropdown.Menu width={240} className="sui-dtfb__menu">
                {facet.options.length === 0 ? (
                  <div className="sui-dtfb__no-options">
                    {t("common.filterEmpty", "Nothing to filter on")}
                  </div>
                ) : (
                  facet.options.map((option) => {
                    const checked = picked.includes(option.value);
                    return (
                      // Not a Dropdown.Item: the menu stays open for several picks.
                      <button
                        key={option.value}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={checked}
                        className="sui-dtfb__option"
                        onClick={() => onToggle(facet.key, option.value)}
                      >
                        <span
                          className={
                            checked
                              ? "sui-dtfb__box sui-dtfb__box--checked"
                              : "sui-dtfb__box"
                          }
                          aria-hidden
                        >
                          {checked && <CheckGlyph />}
                        </span>
                        <span className="sui-dtfb__option-label">
                          {option.label}
                        </span>
                        <span className="sui-dtfb__option-count">
                          {option.count}
                        </span>
                      </button>
                    );
                  })
                )}
              </Dropdown.Menu>
            </Dropdown.Root>
          );
        })}
        {trailing && <div className="sui-dtfb__trailing">{trailing}</div>}
      </div>

      {active.length > 0 && (
        <div className="sui-dtfb__active">
          {active.map(({ facet, value, label }) => (
            <Chip
              key={`${facet.key}:${value}`}
              size="sm"
              showDot={false}
              onRemove={() => onToggle(facet.key, value)}
            >
              {facet.label}: {label}
            </Chip>
          ))}
          <Button variant="quiet" size="sm" onClick={onClearAll}>
            {t("common.clearFilters", "Clear filters")}
          </Button>
        </div>
      )}
    </div>
  );
}
