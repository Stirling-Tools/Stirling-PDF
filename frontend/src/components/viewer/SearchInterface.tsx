import React, { useState, useEffect } from 'react';
import { Box, TextInput, ActionIcon, Text, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { LocalIcon } from '../shared/LocalIcon';

interface SearchInterfaceProps {
  visible: boolean;
  onClose: () => void;
}

export function SearchInterface({ visible, onClose }: SearchInterfaceProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [resultInfo, setResultInfo] = useState<{
    currentIndex: number;
    totalResults: number;
    query: string;
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Monitor search state changes
  useEffect(() => {
    if (!visible) return;

    const checkSearchState = () => {
      const searchAPI = (window as any).embedPdfSearch;
      if (searchAPI) {
        const state = searchAPI.state;
        
        if (state && state.query && state.active) {
          // Try to get result info from the global search data
          // The CustomSearchLayer stores results, let's try to access them
          const searchResults = (window as any).currentSearchResults;
          const activeIndex = (window as any).currentActiveIndex || 1;

          setResultInfo({
            currentIndex: activeIndex,
            totalResults: searchResults ? searchResults.length : 0,
            query: state.query
          });
        } else if (state && !state.active) {
          setResultInfo(null);
        }
        
        setIsSearching(state ? state.loading : false);
      }
    };

    // Check immediately and then poll for updates
    checkSearchState();
    const interval = setInterval(checkSearchState, 200);

    return () => clearInterval(interval);
  }, [visible]);

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;

    const searchAPI = (window as any).embedPdfSearch;
    if (searchAPI) {
      setIsSearching(true);
      try {
        await searchAPI.search(query.trim());
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
    const searchAPI = (window as any).embedPdfSearch;
    if (searchAPI) {
      searchAPI.nextResult();
    }
  };

  const handlePrevious = () => {
    const searchAPI = (window as any).embedPdfSearch;
    if (searchAPI) {
      searchAPI.previousResult();
    }
  };

  const handleClearSearch = () => {
    const searchAPI = (window as any).embedPdfSearch;
    if (searchAPI) {
      searchAPI.clearSearch();
    }
    setSearchQuery('');
    setResultInfo(null);
  };

  const handleClose = () => {
    handleClearSearch();
    onClose();
  };

  if (!visible) return null;

  return (
    <Box
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        backgroundColor: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-gray-3)',
        borderRadius: '8px',
        padding: '16px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        minWidth: '320px',
        maxWidth: '400px'
      }}
    >
      {/* Header with close button */}
      <Group justify="space-between" mb="md">
        <Text size="sm" fw={600}>
          {t('search.title', 'Search PDF')}
        </Text>
        <ActionIcon
          variant="subtle"
          size="sm"
          onClick={handleClose}
          aria-label="Close search"
        >
          <LocalIcon icon="close" width="1rem" height="1rem" />
        </ActionIcon>
      </Group>

      {/* Search input */}
      <Group mb="md">
        <TextInput
          placeholder={t('search.placeholder', 'Enter search term...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
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
          <Text size="sm" c="dimmed">
            {resultInfo.totalResults === 0 
              ? t('search.noResults', 'No results found')
              : t('search.resultCount', '{{current}} of {{total}}', {
                  current: resultInfo.currentIndex,
                  total: resultInfo.totalResults
                })
            }
          </Text>
          
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