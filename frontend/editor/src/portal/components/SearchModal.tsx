import { useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyState, Modal } from "@app/ui";
import { useTranslation } from "react-i18next";
import { rankByFuzzy } from "@app/utils/fuzzySearch";
import { useUI } from "@portal/contexts/UIContext";
import { useView, type ViewId } from "@portal/contexts/ViewContext";
import {
  GROUP_PRIMARY,
  GROUP_OPERATIONAL,
  GROUP_PLATFORM,
  type NavEntry,
} from "@portal/components/sidebarGroups";
import { SearchIcon } from "@portal/components/icons";
import "@portal/components/SearchModal.css";

/**
 * The portal's ⌘K palette — the portal face of the global super search. It
 * searches the portal's own destinations (the same flavor-aware nav set the
 * sidebar shows, plus the editor) and navigates on select; the editor's top-bar
 * search is the same idea pointed at files/tools/settings/Processor.
 */
export function SearchModal() {
  const { t } = useTranslation();
  const { searchOpen, closeSearch } = useUI();
  const { setActiveView } = useView();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (searchOpen) {
      setQuery("");
      setHighlight(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [searchOpen]);

  // Every destination the palette can jump to: the sidebar's nav groups (a
  // flavor seam — saas ships a reduced set) plus the editor app itself.
  const entries = useMemo<NavEntry[]>(
    () => [
      ...GROUP_PRIMARY,
      ...GROUP_OPERATIONAL,
      ...GROUP_PLATFORM,
      { id: "editor" as ViewId, icon: null },
    ],
    [],
  );

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return entries;
    return rankByFuzzy(entries, q, [
      (e) => t(`portal.nav.${e.id}`),
      (e) => e.id,
    ]).map(({ item }) => item);
  }, [entries, query, t]);

  useEffect(() => {
    setHighlight((h) =>
      results.length === 0 ? 0 : Math.min(h, results.length - 1),
    );
  }, [results.length]);

  const select = (entry: NavEntry | undefined) => {
    if (!entry) return;
    closeSearch();
    if (entry.externalUrl) {
      window.open(entry.externalUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setActiveView(entry.id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(results[highlight]);
    }
  };

  return (
    <Modal
      open={searchOpen}
      onClose={closeSearch}
      width="lg"
      ariaLabel={t("portal.search.ariaLabel")}
    >
      <div className="portal-search">
        <div className="portal-search__input-row">
          <SearchIcon size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("portal.search.placeholder")}
            aria-label={t("portal.search.ariaLabel")}
            className="portal-search__input"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="portal-search__esc" aria-hidden>
            ESC
          </span>
        </div>

        <div className="portal-search__results">
          {results.length === 0 ? (
            <EmptyState
              size="compact"
              title={t("portal.search.empty.noMatches", {
                query: query.trim(),
              })}
              description={t("portal.search.empty.noMatchesDescription")}
            />
          ) : (
            <div className="portal-search__group">
              <div className="portal-search__group-label">
                {t("portal.search.goTo")}
              </div>
              {results.map((entry, i) => (
                <Button
                  key={entry.id}
                  variant="tertiary"
                  justify="start"
                  fullWidth
                  className={`portal-search__item${
                    i === highlight ? " portal-search__item--active" : ""
                  }`}
                  onClick={() => select(entry)}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <span className="portal-search__item-label">
                    {t(`portal.nav.${entry.id}`)}
                  </span>
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
