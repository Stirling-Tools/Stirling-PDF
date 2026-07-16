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
import { Chip } from "@app/ui/Chip";
import { TextInput } from "@app/components/shared/TextInput";
import LocalIcon from "@app/components/shared/LocalIcon";
import { isMacLike } from "@app/utils/hotkeys";
import {
  useSuperSearch,
  SuperSearchResult,
  type SuperSearchQueryOptions,
  type SuperSearchScope,
  type UseSuperSearchResult,
} from "@app/hooks/useSuperSearch";
import {
  parseSuperSearchQuery,
  rebuildSuperSearchQuery,
} from "@app/components/shared/superSearch/superSearchFilters";
import "@app/components/shared/superSearch/SuperSearch.css";

interface DropdownRect {
  top: number;
  left: number;
  width: number;
}

interface SuperSearchSection {
  key: string;
  label?: string;
  groups: UseSuperSearchResult["groups"];
}

interface SuperSearchProps {
  /**
   * Results provider, called as a hook — it MUST be referentially stable for
   * the component's lifetime. Defaults to the editor's files/tools/settings/
   * Processor provider; the portal passes its own destinations provider.
   */
  useResults?: (
    query: string,
    active: boolean,
    options?: SuperSearchQueryOptions,
  ) => UseSuperSearchResult;
  /**
   * DOM id for the input — external focus helpers target the default. A host
   * whose bar can coexist with another instance must pass a distinct id.
   */
  inputId?: string;
  /** Optional scope chips + `scope:` prefixes for host-specific filters. */
  scopes?: readonly SuperSearchScope[];
  /** Where to render scope chips when a host enables them. */
  scopeChipsPlacement?: "dropdown" | "inline";
  /** Let a host widen the dropdown beyond the input when needed. */
  dropdownMinWidth?: number;
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
  scopes = [],
  scopeChipsPlacement = "dropdown",
  dropdownMinWidth,
}: SuperSearchProps = {}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<DropdownRect | null>(null);
  const [manualScopeIds, setManualScopeIds] = useState<string[]>([]);
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState<string[]>(
    [],
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // The key of the highlighted result, so async pop-in (entities, file stubs)
  // can't silently shift the highlight onto a different row.
  const highlightKeyRef = useRef<string | null>(null);

  // A hook received as a prop is invisible to the rules-of-hooks lint; pinning
  // the first value makes swapping it mid-life structurally impossible.
  const useResultsHook = useRef(useResults).current;
  const parsedQuery = useMemo(
    () => parseSuperSearchQuery(query, scopes),
    [query, scopes],
  );
  const effectiveScopeIds = useMemo(
    () =>
      Array.from(new Set([...parsedQuery.prefixedScopeIds, ...manualScopeIds])),
    [manualScopeIds, parsedQuery.prefixedScopeIds],
  );
  const activeScopeIds = useMemo(
    () => new Set(effectiveScopeIds),
    [effectiveScopeIds],
  );
  const { groups, flatResults, loadingFiles } = useResultsHook(
    parsedQuery.query,
    open,
    effectiveScopeIds.length > 0 ? { scopeIds: effectiveScopeIds } : undefined,
  );

  const trimmed = parsedQuery.query.trim();
  const hasQuery = trimmed.length > 0;

  const listboxId = `${inputId}-listbox`;
  const optionId = useCallback(
    (index: number) => `${inputId}-option-${index}`,
    [inputId],
  );

  const sections = useMemo<SuperSearchSection[]>(() => {
    const out: SuperSearchSection[] = [];

    for (const group of groups) {
      const current = out[out.length - 1];
      if (current && current.label === group.sectionLabel) {
        current.groups.push(group);
        continue;
      }

      out.push({
        key: group.sectionLabel ?? group.id,
        label: group.sectionLabel,
        groups: [group],
      });
    }

    return out;
  }, [groups]);

  const visibleSections = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        collapsed:
          section.label != null && collapsedSectionKeys.includes(section.key),
      })),
    [collapsedSectionKeys, sections],
  );

  const visibleFlatResults = useMemo(
    () =>
      visibleSections.flatMap((section) =>
        section.collapsed
          ? []
          : section.groups.flatMap((group) => group.results),
      ),
    [visibleSections],
  );

  const moveHighlight = useCallback(
    (index: number) => {
      setHighlight(index);
      highlightKeyRef.current = visibleFlatResults[index]?.key ?? null;
    },
    [visibleFlatResults],
  );

  // When results change, follow the highlighted result to its new index; if
  // it's gone, reset to the top.
  useEffect(() => {
    const key = highlightKeyRef.current;
    if (key) {
      const index = visibleFlatResults.findIndex((r) => r.key === key);
      if (index >= 0) {
        setHighlight(index);
        return;
      }
    }
    highlightKeyRef.current = null;
    setHighlight(0);
  }, [visibleFlatResults]);

  const close = useCallback(() => {
    setOpen(false);
    setHighlight(0);
    setManualScopeIds([]);
    setCollapsedSectionKeys([]);
    setQuery((current) => parseSuperSearchQuery(current, scopes).query);
  }, [scopes]);

  // Position the portalled dropdown directly under the input while open.
  const updateRect = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const viewportPadding = 8;
    const width = Math.min(
      Math.max(r.width, dropdownMinWidth ?? r.width),
      window.innerWidth - viewportPadding * 2,
    );
    const centeredLeft = r.left - (width - r.width) / 2;
    const left = Math.min(
      Math.max(viewportPadding, centeredLeft),
      window.innerWidth - width - viewportPadding,
    );
    setRect({ top: r.bottom + 6, left, width });
  }, [dropdownMinWidth]);

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
        visibleFlatResults.length === 0
          ? 0
          : (highlight + 1) % visibleFlatResults.length,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(
        visibleFlatResults.length === 0
          ? 0
          : (highlight - 1 + visibleFlatResults.length) %
              visibleFlatResults.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectResult(visibleFlatResults[highlight]);
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

  const toggleScope = useCallback(
    (scopeId: string) => {
      if (scopeId === "__all__") {
        setManualScopeIds([]);
        if (parsedQuery.prefixTokens.length > 0) {
          setQuery(parsedQuery.query);
        }
        inputRef.current?.focus();
        return;
      }

      const hasPrefix = parsedQuery.prefixedScopeIds.includes(scopeId);
      if (hasPrefix) {
        setManualScopeIds((current) => current.filter((id) => id !== scopeId));
        const remainingPrefixScopeIds = new Set(
          parsedQuery.prefixedScopeIds.filter((id) => id !== scopeId),
        );
        setQuery(rebuildSuperSearchQuery(parsedQuery, remainingPrefixScopeIds));
        inputRef.current?.focus();
        return;
      }

      setManualScopeIds((current) =>
        current.includes(scopeId)
          ? current.filter((id) => id !== scopeId)
          : [...current, scopeId],
      );
      inputRef.current?.focus();
    },
    [parsedQuery],
  );

  const showNoResults =
    open &&
    !loadingFiles &&
    flatResults.length === 0 &&
    (hasQuery || scopes.length > 0);

  const toggleSection = useCallback((sectionKey: string) => {
    setCollapsedSectionKeys((current) =>
      current.includes(sectionKey)
        ? current.filter((key) => key !== sectionKey)
        : [...current, sectionKey],
    );
    inputRef.current?.focus();
  }, []);

  const scopeFilters =
    scopes.length > 0 ? (
      <div className="super-search-filters" aria-label="Search filters">
        <Chip
          size="sm"
          accent={activeScopeIds.size === 0 ? "default" : "neutral"}
          variant={activeScopeIds.size === 0 ? "primary" : "secondary"}
          aria-pressed={activeScopeIds.size === 0}
          onClick={() => toggleScope("__all__")}
        >
          {t("superSearch.all", "All")}
        </Chip>
        {scopes.map((scope) => {
          const active = activeScopeIds.has(scope.id);
          return (
            <Chip
              key={scope.id}
              size="sm"
              accent={active ? "default" : "neutral"}
              variant={active ? "primary" : "secondary"}
              aria-pressed={active}
              onClick={() => toggleScope(scope.id)}
            >
              {scope.label}
            </Chip>
          );
        })}
      </div>
    ) : null;

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
        {scopeChipsPlacement === "dropdown" && scopeFilters}

        {!hasQuery && scopes.length === 0 && (
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
          visibleSections.map((section) => (
            <div key={section.key} className="super-search-section">
              {section.label && (
                <div className="super-search-section-header">
                  <Button
                    className="super-search-section-toggle"
                    variant="quiet"
                    aria-expanded={!section.collapsed}
                    onClick={() => toggleSection(section.key)}
                    rightSection={
                      <span
                        className={`super-search-section-chevron${
                          section.collapsed
                            ? " super-search-section-chevron--collapsed"
                            : ""
                        }`}
                        aria-hidden="true"
                      >
                        <LocalIcon
                          icon="expand-more-rounded"
                          width="1rem"
                          height="1rem"
                        />
                      </span>
                    }
                  >
                    <span className="super-search-section-label">
                      {section.label}
                    </span>
                  </Button>
                </div>
              )}
              {!section.collapsed && (
                <div className="super-search-section-body">
                  {section.groups.map((group) => (
                    <div
                      key={group.id}
                      className="super-search-group"
                      role="group"
                      aria-label={group.label}
                    >
                      <div
                        className="super-search-group-label"
                        aria-hidden="true"
                      >
                        {group.label}
                      </div>
                      <div className="super-search-group-results">
                        {group.results.map((result) => {
                          const index = visibleFlatResults.indexOf(result);
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    ) : null;

  return (
    <div
      className={`super-search${
        scopeChipsPlacement === "inline" && scopes.length > 0
          ? " super-search--with-inline-filters"
          : ""
      }`}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      <div className="super-search-input-row">
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
            open && visibleFlatResults[highlight]
              ? optionId(highlight)
              : undefined
          }
          aria-autocomplete="list"
          onFocus={() => setOpen(true)}
        />
        {!open && !hasQuery && (
          <kbd className="super-search-kbd" aria-hidden="true">
            {shortcutHint}
          </kbd>
        )}
      </div>
      {scopeChipsPlacement === "inline" && scopeFilters}
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
