import React, { useState, useEffect, useRef } from 'react';
import { Box, TextInput, ActionIcon, Text, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { LocalIcon } from '@app/components/shared/LocalIcon';
import { ViewerContext } from '@app/contexts/ViewerContext';

interface SearchInterfaceProps {
  visible: boolean;
  onClose: () => void;
}

export function SearchInterface({ visible, onClose }: SearchInterfaceProps) {
  const { t } = useTranslation();
  const viewerContext = React.useContext(ViewerContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const searchState = viewerContext?.getSearchState();
  const searchResults = searchState?.results;
  const searchActiveIndex = searchState?.activeIndex;
  const searchActions = viewerContext?.searchActions;
  const [searchQuery, setSearchQuery] = useState('');
  const [jumpToValue, setJumpToValue] = useState('');
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

    window.addEventListener('refocus-search-input', handleRefocus);
    return () => {
      window.removeEventListener('refocus-search-input', handleRefocus);
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
          console.error('Search failed:', error);
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
      // Use ViewerContext state instead of window APIs
      if (searchResults && searchResults.length > 0) {
        const activeIndex = searchActiveIndex || 1;

        setResultInfo({
          currentIndex: activeIndex,
          totalResults: searchResults.length,
          query: searchQuery // Use local search query
        });
      } else if (searchQuery && searchResults?.length === 0) {
        // Show "no results" state
        setResultInfo({
          currentIndex: 0,
          totalResults: 0,
          query: searchQuery
        });
      } else {
        setResultInfo(null);
      }
    };

    // Check immediately and then poll for updates
    checkSearchState();
    const interval = setInterval(checkSearchState, 200);

    return () => clearInterval(interval);
  }, [visible, searchResults, searchActiveIndex, searchQuery]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Navigate to next result on Enter
      event.preventDefault();
      handleNext();
    } else if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'ArrowDown') {
      // Navigate to next result
      event.preventDefault();
      handleNext();
    } else if (event.key === 'ArrowUp') {
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
    setSearchQuery('');
    setResultInfo(null);
  };

  // No longer need to sync with external API on mount - removed

  const handleJumpToResult = (index: number) => {
    if (resultInfo && index >= 1 && index <= resultInfo.totalResults) {
      // Convert to 0-based index for the API
      searchActions?.goToResult?.(index - 1);
    }
  };

  const handleJumpToSubmit = () => {
    const index = parseInt(jumpToValue, 10);
    if (!isNaN(index) && resultInfo && index >= 1 && index <= resultInfo.totalResults) {
      handleJumpToResult(index);
      setJumpToValue(''); // Clear the input after jumping
    }
  };

  const handleJumpToKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJumpToSubmit();
    }
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


  return (
    <Box
      style={{
        padding: '0px'
      }}
    >
      {/* Header with close button */}
      <Group mb="md" justify="space-between">
        <Text size="sm" fw={600}>
          {t('search.title', 'Search PDF')}
        </Text>
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={handleCloseClick}
          aria-label="Close search"
        >
          <LocalIcon icon="close" width="1rem" height="1rem" />
        </ActionIcon>
      </Group>

      {/* Search input */}
      <Group mb="md">
        <TextInput
          ref={inputRef}
          placeholder={t('search.placeholder', 'Enter search term...')}
          value={searchQuery}
          onChange={(e) => {
            const newValue = e.currentTarget.value;
            setSearchQuery(newValue);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleInputBlur}
          style={{ flex: 1 }}
          rightSection={
            searchQuery.trim() && (
              <ActionIcon
                variant="subtle"
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                <LocalIcon icon="close" width="0.875rem" height="0.875rem" />
              </ActionIcon>
            )
          }
        />
      </Group>

      {/* Results info and navigation - always show */}
      <Group justify="space-between" align="center">
        <Group gap="xs" align="center">
          <TextInput
            size="xs"
            value={jumpToValue}
            onChange={(e) => {
              const newValue = e.currentTarget.value;
              setJumpToValue(newValue);

              // Jump immediately as user types
              const index = parseInt(newValue, 10);
              if (resultInfo && !isNaN(index) && index >= 1 && index <= resultInfo.totalResults) {
                handleJumpToResult(index);
              }
            }}
            onKeyDown={handleJumpToKeyDown}
            onBlur={() => setJumpToValue('')} // Clear on blur instead of submit
            placeholder={(resultInfo?.currentIndex || 0).toString()}
            style={{ width: '3rem' }}
            type="number"
            min="1"
            max={resultInfo?.totalResults || 0}
            disabled={!resultInfo || resultInfo.totalResults === 0}
          />
          <Text size="sm" c="dimmed">
            of {resultInfo?.totalResults || 0}
          </Text>
        </Group>

        <Group gap="xs">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={handlePrevious}
            disabled={!resultInfo || resultInfo.currentIndex <= 1}
            aria-label="Previous result"
          >
            <LocalIcon icon="keyboard-arrow-up" width="1rem" height="1rem" />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={handleNext}
            disabled={!resultInfo || resultInfo.currentIndex >= resultInfo.totalResults}
            aria-label="Next result"
          >
            <LocalIcon icon="keyboard-arrow-down" width="1rem" height="1rem" />
          </ActionIcon>
        </Group>
      </Group>

      {/* Loading state */}
      {isSearching && (
        <Text size="xs" c="dimmed" ta="center" mt="sm">
          {t('search.searching', 'Searching...')}
        </Text>
      )}
    </Box>
  );
}