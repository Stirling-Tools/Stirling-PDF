import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, Modal, Skeleton } from "@shared/components";
import { useUI } from "@portal/contexts/UIContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import { fetchQuickActions, type QuickAction } from "@portal/api/search";
import { SearchIcon } from "@portal/components/icons";
import "@portal/components/SearchModal.css";

export function SearchModal() {
  const { t } = useTranslation();
  const { searchOpen, closeSearch } = useUI();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const state = useAsync<QuickAction[]>(() => fetchQuickActions(), []);
  const { data: actions } = state;
  const { isLoading } = useSectionFlags(state);

  useEffect(() => {
    if (searchOpen) {
      setQuery("");
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [searchOpen]);

  const filtered = useMemo(() => {
    if (!actions) return [] as QuickAction[];
    if (!query.trim()) return actions;
    const needle = query.trim().toLowerCase();
    return actions.filter((item) => item.label.toLowerCase().includes(needle));
  }, [actions, query]);

  const groups = useMemo(
    () =>
      filtered.reduce<Record<string, QuickAction[]>>((acc, item) => {
        if (!acc[item.group]) acc[item.group] = [];
        acc[item.group].push(item);
        return acc;
      }, {}),
    [filtered],
  );

  const groupKeys = Object.keys(groups);
  const isEmpty = !isLoading && groupKeys.length === 0;

  return (
    <Modal
      open={searchOpen}
      onClose={closeSearch}
      width="lg"
      ariaLabel={t("search.ariaLabel")}
    >
      <div className="portal-search">
        <div className="portal-search__input-row">
          <SearchIcon size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("search.ariaLabel")}
            className="portal-search__input"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="portal-search__esc" aria-hidden>
            ESC
          </span>
        </div>

        <div className="portal-search__results">
          {isLoading && (
            <div className="portal-search__loading">
              <Skeleton height="1rem" width="40%" />
              <Skeleton height="0.875rem" />
              <Skeleton height="0.875rem" width="80%" />
              <Skeleton height="0.875rem" width="65%" />
            </div>
          )}
          {isEmpty && (
            <EmptyState
              size="compact"
              title={
                query.trim()
                  ? t("search.empty.noMatches", { query: query.trim() })
                  : t("search.empty.noActionsTitle")
              }
              description={
                query.trim()
                  ? t("search.empty.noMatchesDescription")
                  : t("search.empty.noActionsDescription")
              }
            />
          )}
          {!isLoading &&
            !isEmpty &&
            Object.entries(groups).map(([group, items]) => (
              <div key={group} className="portal-search__group">
                <div className="portal-search__group-label">{group}</div>
                {items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="portal-search__item"
                    onClick={closeSearch}
                  >
                    <span className="portal-search__item-label">
                      {item.label}
                    </span>
                    <span className="portal-search__item-hint">
                      {item.hint}
                    </span>
                  </button>
                ))}
              </div>
            ))}
        </div>
      </div>
    </Modal>
  );
}
