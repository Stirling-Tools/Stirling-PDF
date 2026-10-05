import React, { useState, useEffect, useRef } from "react";
import { TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { ActionIcon } from "@app/ui/ActionIcon";
import { ViewerContext } from "@app/contexts/ViewerContext";
import "@app/components/viewer/FindPanel.css";

interface SearchInterfaceProps {
  visible: boolean;
  onClose: () => void;
}

export function SearchInterface({ visible, onClose }: SearchInterfaceProps) {
  const { t } = useTranslation();
  const viewerContext = React.useContext(ViewerContext);
  const viewerContextRef = useRef(viewerContext);

  useEffect(() => {
    viewerContextRef.current = viewerContext;
  }, [viewerContext]);

  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const searchActions = viewerContext?.searchActions;
  const [searchQuery, setSearchQuery] = useState("");
  const [resultInfo, setResultInfo] = useState<{
    currentIndex: number;
    totalResults: number;
    query: string;
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Auto-focus search input when visible
  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
    }
  }, [visible]);

  // Listen for refocus event (when Ctrl+F pressed while already open)
  useEffect(() => {
    const handleRefocus = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    window.addEventListener("refocus-search-input", handleRefocus);
    return () => {
      window.removeEventListener("refocus-search-input", handleRefocus);
    };
  }, []);

  // Auto-search as user types (debounced)
  useEffect(() => {
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // If query is empty, clear search immediately
    if (!searchQuery.trim()) {
      searchActions?.clear();
      setResultInfo(null);
      return;
    }

    // Debounce search by 300ms
    searchTimeoutRef.current = setTimeout(async () => {
      if (searchQuery.trim() && searchActions) {
        setIsSearching(true);
        try {
          await searchActions.search(searchQuery.trim());
        } catch (error) {
          console.error("Search failed:", error);
        } finally {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, searchActions]);

  // Monitor search state changes
  useEffect(() => {
    if (!visible) return;

    const checkSearchState = () => {
      // Fetch fresh search state from ViewerContext ref to avoid closure stale values
      const searchState = viewerContextRef.current?.getSearchState();
      const searchResults = searchState?.results;
      const searchActiveIndex = searchState?.activeIndex;

      if (searchResults && searchResults.length > 0) {
        const activeIndex = searchActiveIndex || 1;

        setResultInfo({
          currentIndex: activeIndex,
          totalResults: searchResults.length,
          query: searchQuery, // Use local search query
        });
      } else if (searchQuery && searchResults?.length === 0) {
        // Show "no results" state
        setResultInfo({
          currentIndex: 0,
          totalResults: 0,
          query: searchQuery,
        });
      } else {
        setResultInfo(null);
      }
    };

    // Check immediately and then poll for updates
    checkSearchState();
    const interval = setInterval(checkSearchState, 200);

    return () => clearInterval(interval);
  }, [visible, searchQuery]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      // Navigate to next result on Enter
      event.preventDefault();
      handleNext();
    } else if (event.key === "Escape") {
      onClose();
    } else if (event.key === "ArrowDown") {
      // Navigate to next result
      event.preventDefault();
      handleNext();
    } else if (event.key === "ArrowUp") {
      // Navigate to previous result
      event.preventDefault();
      handlePrevious();
    }
  };

  const handleNext = () => {
    searchActions?.next();
  };

  const handlePrevious = () => {
    searchActions?.previous();
  };

  const handleClearSearch = () => {
    searchActions?.clear();
    setSearchQuery("");
    setResultInfo(null);
  };

  const handleInputBlur = () => {
    // Close popover on blur if no text is entered
    if (!searchQuery.trim()) {
      onClose();
    }
  };

  const handleCloseClick = () => {
    handleClearSearch();
    onClose();
  };

  const hasResults = !!resultInfo && resultInfo.totalResults > 0;
  const countLabel = isSearching
    ? t("search.searching", "Searching...")
    : resultInfo
      ? hasResults
        ? t("viewer.search.count", "{{current}} of {{total}}", {
            current: resultInfo.currentIndex,
            total: resultInfo.totalResults,
          })
        : t("search.noResults", "No results found")
      : "";

  return (
    <div className="find-panel">
      <div className="find-panel__head">
        <span className="find-panel__title">
          {t("search.title", "Search PDF")}
        </span>
        <ActionIcon
          variant="tertiary"
          size="sm"
          onClick={handleCloseClick}
          aria-label={t("viewer.search.close", "Close search")}
        >
          <Icon name="x" size="1rem" />
        </ActionIcon>
      </div>
      <div className="find-panel__row">
        <TextInput
          ref={inputRef}
          placeholder={t("search.placeholder", "Enter search term...")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleInputBlur}
          leftSection={<Icon name="search" size="1rem" />}
          rightSectionWidth="auto"
          rightSectionPointerEvents="all"
          rightSection={
            searchQuery.trim() ? (
              <span className="find-panel__row">
                <span
                  className="find-panel__count"
                  role="status"
                  aria-live="polite"
                >
                  {countLabel}
                </span>
                <ActionIcon
                  variant="tertiary"
                  size="sm"
                  onClick={handleClearSearch}
                  aria-label={t("viewer.search.clear", "Clear search")}
                  style={{ marginRight: 4 }}
                >
                  <Icon name="x" size="0.875rem" />
                </ActionIcon>
              </span>
            ) : null
          }
        />
        <ActionIcon
          variant="tertiary"
          onClick={handlePrevious}
          disabled={!hasResults}
          aria-label={t("viewer.search.previous", "Previous result")}
        >
          <Icon name="chevron-up" size="1rem" />
        </ActionIcon>
        <ActionIcon
          variant="tertiary"
          onClick={handleNext}
          disabled={!hasResults}
          aria-label={t("viewer.search.next", "Next result")}
        >
          <Icon name="chevron-down" size="1rem" />
        </ActionIcon>
      </div>
    </div>
  );
}
