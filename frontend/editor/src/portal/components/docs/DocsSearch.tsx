import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import type { SearchResult, Segment } from "@portal/docs/search";

/** Render highlighted segments, wrapping matched runs in <mark>. */
function Highlighted({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.hit ? (
          <mark key={i} className="portal-docs__hl">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Docs search box + results. While a query is active it shows a ranked list of
 * matching docs — each with its section, a highlighted title, and a content
 * snippet — that navigates on click (or Enter). Arrow keys move the selection.
 */
export function DocsSearch({
  query,
  onQueryChange,
  results,
  onSelect,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: SearchResult[];
  onSelect: (docId: string) => void;
}) {
  const { t } = useTranslation();
  // -1 = nothing pre-selected; arrow keys drive this, the mouse uses CSS :hover.
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const hasQuery = query.trim().length > 0;

  useEffect(() => setActiveIndex(-1), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      onQueryChange("");
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[activeIndex >= 0 ? activeIndex : 0];
      if (hit) onSelect(hit.id);
    }
  };

  return (
    <div className="portal-docs__search">
      <div className="portal-docs__search-box">
        <span className="portal-docs__search-icon" aria-hidden>
          ⌕
        </span>
        <input
          type="search"
          className="portal-docs__search-input"
          placeholder={t("portal.docs.search.placeholder")}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={t("portal.docs.search.placeholder")}
        />
      </div>

      {hasQuery && (
        <div className="portal-docs__results">
          {results.length === 0 ? (
            <p className="portal-docs__nav-empty">
              {t("portal.docs.search.empty")}
            </p>
          ) : (
            <>
              <div className="portal-docs__results-count">
                {t("portal.docs.search.results", { count: results.length })}
              </div>
              <ul ref={listRef} className="portal-docs__results-list">
                {results.map((r, i) => (
                  <li key={r.id}>
                    <Button
                      variant="tertiary"
                      fullWidth
                      justify="start"
                      className={
                        "portal-docs__result" +
                        (i === activeIndex ? " is-active" : "")
                      }
                      data-active={i === activeIndex}
                      onClick={() => onSelect(r.id)}
                    >
                      <span className="portal-docs__result-body">
                        <span className="portal-docs__result-head">
                          <span className="portal-docs__result-title">
                            <Highlighted segments={r.titleSegments} />
                          </span>
                          <span className="portal-docs__result-section">
                            {r.sectionLabel}
                          </span>
                        </span>
                        <span className="portal-docs__result-snippet">
                          <Highlighted segments={r.snippet} />
                        </span>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
