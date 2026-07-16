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
import { Button } from "@app/ui/Button";
import { TextInput } from "@app/components/shared/TextInput";
import LocalIcon from "@app/components/shared/LocalIcon";
import { isMacLike } from "@app/utils/hotkeys";
import {
  useSuperSearch,
  SuperSearchResult,
  type UseSuperSearchResult,
} from "@app/hooks/useSuperSearch";
import "@app/components/shared/superSearch/SuperSearch.css";

interface DropdownRect {
  top: number;
  left: number;
  width: number;
}

interface SuperSearchProps {
  /**
   * Results provider, called as a hook — it MUST be referentially stable for
   * the component's lifetime. Defaults to the editor's files/tools/settings/
   * Processor provider; the portal passes its own destinations provider.
   */
  useResults?: (query: string, active: boolean) => UseSuperSearchResult;
  /**
   * DOM id for the input — external focus helpers target the default. A host
   * whose bar can coexist with another instance must pass a distinct id.
   */
  inputId?: string;
}

/**
 * Global "super search": a single entry point that searches across the host
 * app's destinations from a persistent bar. The results hang in a dropdown
 * directly below the input; Cmd/Ctrl+K focuses and opens it.
 *
 * The dropdown is portalled to <body>: the host bar's inner wrapper may set
 * `overflow: hidden`, which would otherwise clip it.
 */
export default function SuperSearch({
  useResults = useSuperSearch,
  inputId = "super-search-input",
}: SuperSearchProps = {}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<DropdownRect | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // The key of the highlighted result, so async pop-in (entities, file stubs)
  // can't silently shift the highlight onto a different row.
  const highlightKeyRef = useRef<string | null>(null);

  // A hook received as a prop is invisible to the rules-of-hooks lint; pinning
  // the first value makes swapping it mid-life structurally impossible.
  const useResultsHook = useRef(useResults).current;
  const { groups, flatResults, loadingFiles } = useResultsHook(query, open);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  const listboxId = `${inputId}-listbox`;
  const optionId = useCallback(
    (index: number) => `${inputId}-option-${index}`,
    [inputId],
  );

  const moveHighlight = useCallback(
    (index: number) => {
      setHighlight(index);
      highlightKeyRef.current = flatResults[index]?.key ?? null;
    },
    [flatResults],
  );

  // When results change, follow the highlighted result to its new index; if
  // it's gone, reset to the top.
  useEffect(() => {
    const key = highlightKeyRef.current;
    if (key) {
      const index = flatResults.findIndex((r) => r.key === key);
      if (index >= 0) {
        setHighlight(index);
        return;
      }
    }
    highlightKeyRef.current = null;
    setHighlight(0);
  }, [flatResults]);

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

  // Global Cmd/Ctrl+K to focus + open the search. Matched on e.code so it
  // works on non-Latin keyboard layouts, where e.key isn't "k".
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const combo =
        (isMacLike() ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey;
      if (!combo || e.code !== "KeyK") return;
      // Leave the shortcut alone while a modal owns the screen — focusing an
      // input underneath the overlay would strand keyboard focus.
      const target = e.target as HTMLElement | null;
      if (target?.closest('[role="dialog"]')) return;
      e.preventDefault();
      setOpen(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Keep the highlighted row visible when keyboard navigation moves it past
  // the dropdown's scroll fold.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(optionId(highlight))
      ?.scrollIntoView({ block: "nearest" });
  }, [open, highlight, optionId]);

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
    // During IME composition (CJK input), Enter commits the composition and
    // arrows pick candidates — those keystrokes are not for us.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      moveHighlight(
        flatResults.length === 0 ? 0 : (highlight + 1) % flatResults.length,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(
        flatResults.length === 0
          ? 0
          : (highlight - 1 + flatResults.length) % flatResults.length,
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
        id={listboxId}
        className="super-search-dropdown"
        role="listbox"
        style={{ top: rect.top, left: rect.left, width: rect.width }}
        // Keep focus on the input when clicking inside the dropdown.
        onMouseDown={(e) => e.preventDefault()}
      >
        {!hasQuery && (
          <div className="super-search-empty">
            {t("superSearch.hint", "Type to search")}
          </div>
        )}

        {showNoResults && (
          <div className="super-search-empty">
            {t("search.noResults", "No results found")}
          </div>
        )}

        {hasQuery &&
          groups.map((group) => (
            <div
              key={group.id}
              className="super-search-group"
              role="group"
              aria-label={group.label}
            >
              <div className="super-search-group-label" aria-hidden="true">
                {group.label}
              </div>
              {group.results.map((result) => {
                const index = flatResults.indexOf(result);
                const active = index === highlight;
                return (
                  <Button
                    key={result.key}
                    id={optionId(index)}
                    type="button"
                    variant="quiet"
                    justify="start"
                    fullWidth
                    role="option"
                    aria-selected={active}
                    className={`super-search-item${active ? " active" : ""}`}
                    onMouseEnter={() => moveHighlight(index)}
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
                  </Button>
                );
              })}
            </div>
          ))}
      </div>
    ) : null;

  return (
    <div className="super-search" ref={containerRef} onKeyDown={handleKeyDown}>
      <TextInput
        id={inputId}
        name={inputId}
        ref={inputRef}
        value={query}
        onChange={setQuery}
        placeholder={t("superSearch.placeholder", "Search Stirling")}
        icon={
          <LocalIcon icon="search-rounded" width="1.1rem" height="1.1rem" />
        }
        autoComplete="off"
        role="combobox"
        aria-label={t("superSearch.ariaLabel", "Super search")}
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && flatResults[highlight] ? optionId(highlight) : undefined
        }
        aria-autocomplete="list"
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
