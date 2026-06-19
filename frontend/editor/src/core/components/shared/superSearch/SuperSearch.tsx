import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Text } from "@mantine/core";
import { TextInput } from "@app/components/shared/TextInput";
import LocalIcon from "@app/components/shared/LocalIcon";
import { isMacLike } from "@app/utils/hotkeys";
import { useSuperSearch, SuperSearchResult } from "@app/hooks/useSuperSearch";
import "@app/components/shared/superSearch/SuperSearch.css";

interface DropdownRect {
  top: number;
  left: number;
  width: number;
}

/**
 * Global "super search": a single entry point that searches across My Files,
 * Tools, and Settings from the (now permanent) top bar. The results hang in a
 * dropdown directly below the input; Cmd/Ctrl+K focuses and opens it.
 *
 * The dropdown is portalled to <body>: the workbench bar's inner wrapper sets
 * `overflow: hidden`, which would otherwise clip it.
 */
export default function SuperSearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<DropdownRect | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { groups, flatResults, loadingFiles } = useSuperSearch(query, open);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  // Keep the highlighted index within bounds as results change.
  useEffect(() => {
    setHighlight((h) =>
      flatResults.length === 0 ? 0 : Math.min(h, flatResults.length - 1),
    );
  }, [flatResults.length]);

  const close = useCallback(() => {
    setOpen(false);
    setHighlight(0);
  }, []);

  // Position the portalled dropdown directly under the input while open.
  const updateRect = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 6, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open, updateRect]);

  const selectResult = useCallback(
    (result: SuperSearchResult | undefined) => {
      if (!result) return;
      void result.onSelect();
      setQuery("");
      close();
      inputRef.current?.blur();
    },
    [close],
  );

  // Global Cmd/Ctrl+K to focus + open the search.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const combo =
        (isMacLike() ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey;
      if (combo && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Close on click outside the input or the (portalled) dropdown.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, close]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) =>
        flatResults.length === 0 ? 0 : (h + 1) % flatResults.length,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) =>
        flatResults.length === 0
          ? 0
          : (h - 1 + flatResults.length) % flatResults.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectResult(flatResults[highlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (hasQuery) {
        setQuery("");
      } else {
        close();
        inputRef.current?.blur();
      }
    }
  };

  const shortcutHint = useMemo(() => (isMacLike() ? "⌘K" : "Ctrl+K"), []);

  const showNoResults =
    open && hasQuery && !loadingFiles && flatResults.length === 0;

  const dropdown =
    open && rect ? (
      <div
        ref={dropdownRef}
        className="super-search-dropdown"
        role="listbox"
        style={{ top: rect.top, left: rect.left, width: rect.width }}
        // Keep focus on the input when clicking inside the dropdown.
        onMouseDown={(e) => e.preventDefault()}
      >
        {!hasQuery && (
          <div className="super-search-empty">
            {t(
              "superSearch.hint",
              "Type to search across your files, tools and settings",
            )}
          </div>
        )}

        {showNoResults && (
          <div className="super-search-empty">
            {t("search.noResults", "No results found")}
          </div>
        )}

        {hasQuery &&
          groups.map((group) => (
            <div key={group.id} className="super-search-group">
              <div className="super-search-group-label">{group.label}</div>
              {group.results.map((result) => {
                const index = flatResults.indexOf(result);
                const active = index === highlight;
                return (
                  <button
                    key={result.key}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`super-search-item${active ? " active" : ""}`}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => selectResult(result)}
                  >
                    <span className="super-search-item-icon">
                      {result.icon ?? (
                        <LocalIcon
                          icon={result.iconName ?? "search-rounded"}
                          width="1.1rem"
                          height="1.1rem"
                        />
                      )}
                    </span>
                    <span className="super-search-item-text">
                      <span className="super-search-item-title">
                        {result.title}
                      </span>
                      {result.subtitle && (
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {result.subtitle}
                        </Text>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
      </div>
    ) : null;

  return (
    <div className="super-search" ref={containerRef} onKeyDown={handleKeyDown}>
      <TextInput
        id="super-search-input"
        name="super-search-input"
        ref={inputRef}
        value={query}
        onChange={setQuery}
        placeholder={t(
          "superSearch.placeholder",
          "Search files, tools and settings…",
        )}
        icon={
          <LocalIcon icon="search-rounded" width="1.1rem" height="1.1rem" />
        }
        autoComplete="off"
        aria-label={t("superSearch.ariaLabel", "Super search")}
        onFocus={() => setOpen(true)}
      />
      {!open && !hasQuery && (
        <kbd className="super-search-kbd" aria-hidden="true">
          {shortcutHint}
        </kbd>
      )}
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
