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

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      // If query is empty, clear the search
      handleClearSearch();
      return;
    }

    if (query.trim() && searchActions) {
      setIsSearching(true);
      try {
        await searchActions.search(query.trim());
      } catch (error) {
        console.error('Search failed:', error);
      } finally {
        setIsSearching(false);
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearch(searchQuery);
    } else if (event.key === 'Escape') {
      onClose();
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
    // Use context actions instead of window API - functionality simplified for now
    if (resultInfo && index >= 1 && index <= resultInfo.totalResults) {
      // Note: goToResult functionality would need to be implemented in SearchAPIBridge
      console.log('Jump to result:', index);
    }
  };

  const handleJumpToSubmit = () => {
    const index = parseInt(jumpToValue);
    if (index && resultInfo && index >= 1 && index <= resultInfo.totalResults) {
      handleJumpToResult(index);
    }
  };

  const handleJumpToKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJumpToSubmit();
    }
  };

  const _handleClose = () => {
    handleClearSearch();
    onClose();
  };


  return (
    <Box
      style={{
        padding: '0px'
      }}
    >
      {/* Header */}
      <Group mb="md">
        <Text size="sm" fw={600}>
          {t('search.title', 'Search PDF')}
        </Text>
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
            // If user clears the input, clear the search highlights
            if (!newValue.trim()) {
              handleClearSearch();
            }
          }}
          onKeyDown={handleKeyDown}
          style={{ flex: 1 }}
          rightSection={
            <ActionIcon
              variant="subtle"
              onClick={() => handleSearch(searchQuery)}
              disabled={!searchQuery.trim() || isSearching}
              loading={isSearching}
            >
              <LocalIcon icon="search" width="1rem" height="1rem" />
            </ActionIcon>
          }
        />
      </Group>

      {/* Results info and navigation */}
      {resultInfo && (
        <Group justify="space-between" align="center">
          {resultInfo.totalResults === 0 ? (
            <Text size="sm" c="dimmed">
              {t('search.noResults', 'No results found')}
            </Text>
          ) : (
            <Group gap="xs" align="center">
              <TextInput
                size="xs"
                value={jumpToValue}
                onChange={(e) => setJumpToValue(e.currentTarget.value)}
                onKeyDown={handleJumpToKeyDown}
                onBlur={handleJumpToSubmit}
                placeholder={resultInfo.currentIndex.toString()}
                style={{ width: '3rem' }}
                type="number"
                min="1"
                max={resultInfo.totalResults}
              />
              <Text size="sm" c="dimmed">
                of {resultInfo.totalResults}
              </Text>
            </Group>
          )}
          
          {resultInfo.totalResults > 0 && (
            <Group gap="xs">
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={handlePrevious}
                disabled={resultInfo.currentIndex <= 1}
                aria-label="Previous result"
              >
                <LocalIcon icon="keyboard-arrow-up" width="1rem" height="1rem" />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={handleNext}
                disabled={resultInfo.currentIndex >= resultInfo.totalResults}
                aria-label="Next result"
              >
                <LocalIcon icon="keyboard-arrow-down" width="1rem" height="1rem" />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                <LocalIcon icon="close" width="1rem" height="1rem" />
              </ActionIcon>
            </Group>
          )}
        </Group>
      )}

      {/* Loading state */}
      {isSearching && (
        <Text size="xs" c="dimmed" ta="center" mt="sm">
          {t('search.searching', 'Searching...')}
        </Text>
      )}
    </Box>
  );
}