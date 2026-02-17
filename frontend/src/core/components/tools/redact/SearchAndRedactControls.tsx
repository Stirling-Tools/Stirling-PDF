import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Stack, Text, Divider, ColorInput, TextInput, Checkbox, Group, Loader } from '@mantine/core';
import SearchIcon from '@mui/icons-material/Search';
import { useRedaction, useRedactionMode } from '@app/contexts/RedactionContext';
import { useViewer } from '@app/contexts/ViewerContext';
import type { SearchTextResult } from '@app/contexts/RedactionContext';

interface SearchAndRedactControlsProps {
  disabled?: boolean;
}

/**
 * SearchAndRedactControls provides UI for the Search & Redact workflow.
 * Searches for text across the PDF and redacts all matches at once.
 */
export default function SearchAndRedactControls({ disabled = false }: SearchAndRedactControlsProps) {
  const { t } = useTranslation();
  const { searchText, redactText, setManualRedactColor } = useRedaction();
  const { isBridgeReady, manualRedactColor } = useRedactionMode();
  const { applyChanges } = useViewer();
  const inputRef = useRef<HTMLInputElement>(null);

  // Internal state
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isRedacting, setIsRedacting] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchTextResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isApiReady = isBridgeReady;

  // Focus input on mount
  useEffect(() => {
    if (isApiReady && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isApiReady]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;

    // Validate regex if enabled
    if (useRegex) {
      try {
        new RegExp(query, caseSensitive ? '' : 'i');
      } catch {
        setError(t('redact.searchAndRedact.invalidRegex', 'Invalid regular expression'));
        return;
      }
    }

    setIsSearching(true);
    setError(null);
    setSearchResults(null);

    try {
      const result = await searchText(query, { caseSensitive, wholeWord, regex: useRegex });
      setSearchResults(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('redact.searchAndRedact.searchFailed', 'Search failed'));
    } finally {
      setIsSearching(false);
    }
  }, [query, caseSensitive, wholeWord, useRegex, searchText, t]);

  const handleRedact = useCallback(async () => {
    if (!query.trim()) return;

    setIsRedacting(true);
    setError(null);

    try {
      const result = await redactText(query, { caseSensitive, wholeWord, regex: useRegex });
      if (result) {
        // Redaction annotations created successfully — clear search results
        setSearchResults(null);
        setQuery('');
      } else {
        setError(t('redact.searchAndRedact.noMatchesRedacted', 'No matches found to redact'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('redact.searchAndRedact.redactFailed', 'Redaction failed'));
    } finally {
      setIsRedacting(false);
    }
  }, [query, caseSensitive, wholeWord, useRegex, redactText, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  // Handle saving changes
  const handleSaveChanges = useCallback(async () => {
    if (applyChanges) {
      await applyChanges();
    }
  }, [applyChanges]);

  const hasResults = searchResults !== null;
  const matchCount = searchResults?.totalCount ?? 0;
  const pageCount = searchResults?.foundOnPages.length ?? 0;

  return (
    <>
      <Divider my="sm" />
      <Stack gap="md">
        <Text size="sm" fw={500}>
          {t('redact.searchAndRedact.title', 'Search & Redact')}
        </Text>

        <Text size="xs" c="dimmed">
          {t('redact.searchAndRedact.instructions', 'Enter text to find in the PDF. You can then redact all matches at once.')}
        </Text>

        {/* Search input */}
        <TextInput
          ref={inputRef}
          label={t('redact.searchAndRedact.searchLabel', 'Search Text')}
          placeholder={useRegex
            ? t('redact.searchAndRedact.regexPlaceholder', 'Enter regex pattern...')
            : t('redact.searchAndRedact.searchPlaceholder', 'Enter text to search for...')
          }
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setSearchResults(null);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled || !isApiReady || isSearching || isRedacting}
          size="sm"
          rightSection={isSearching ? <Loader size="xs" /> : undefined}
        />

        {/* Search options */}
        <Group gap="md">
          <Checkbox
            label={t('redact.searchAndRedact.caseSensitive', 'Case sensitive')}
            checked={caseSensitive}
            onChange={(e) => {
              setCaseSensitive(e.currentTarget.checked);
              setSearchResults(null);
            }}
            disabled={disabled || !isApiReady || isSearching || isRedacting}
            size="sm"
          />
          <Checkbox
            label={t('redact.searchAndRedact.wholeWord', 'Whole word')}
            checked={wholeWord}
            onChange={(e) => {
              setWholeWord(e.currentTarget.checked);
              setSearchResults(null);
            }}
            disabled={disabled || !isApiReady || isSearching || isRedacting || useRegex}
            size="sm"
          />
          <Checkbox
            label={t('redact.searchAndRedact.regex', 'Regex')}
            checked={useRegex}
            onChange={(e) => {
              setUseRegex(e.currentTarget.checked);
              setSearchResults(null);
              // Disable whole word when regex is active
              if (e.currentTarget.checked) {
                setWholeWord(false);
              }
            }}
            disabled={disabled || !isApiReady || isSearching || isRedacting}
            size="sm"
          />
        </Group>

        {/* Color picker */}
        <ColorInput
          label={t('redact.searchAndRedact.colorLabel', 'Redaction Colour')}
          value={manualRedactColor}
          onChange={setManualRedactColor}
          disabled={disabled || !isApiReady}
          size="sm"
          format="hex"
          popoverProps={{ withinPortal: true }}
        />

        {/* Search button */}
        <Button
          variant="outline"
          leftSection={<SearchIcon style={{ fontSize: 18, flexShrink: 0 }} />}
          onClick={handleSearch}
          disabled={disabled || !isApiReady || !query.trim() || isSearching || isRedacting}
          loading={isSearching}
          fullWidth
          size="sm"
        >
          {t('redact.searchAndRedact.searchButton', 'Search')}
        </Button>

        {/* Results display */}
        {hasResults && matchCount > 0 && (
          <Text size="sm" c="teal" fw={500}>
            {t('redact.searchAndRedact.matchesFound', '{{count}} matches found on {{pages}} page(s)', {
              count: matchCount,
              pages: pageCount,
            })}
          </Text>
        )}

        {hasResults && matchCount === 0 && (
          <Text size="sm" c="dimmed">
            {t('redact.searchAndRedact.noMatches', 'No matches found')}
          </Text>
        )}

        {/* Page list */}
        {hasResults && matchCount > 0 && searchResults.foundOnPages.length <= 20 && (
          <Text size="xs" c="dimmed">
            {t('redact.searchAndRedact.onPages', 'Pages: {{pages}}', {
              pages: searchResults.foundOnPages.join(', '),
            })}
          </Text>
        )}

        {/* Error display */}
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}

        {/* Redact button */}
        <Button
          variant="filled"
          color="red"
          onClick={handleRedact}
          disabled={disabled || !isApiReady || !query.trim() || isRedacting || (hasResults && matchCount === 0)}
          loading={isRedacting}
          fullWidth
          size="md"
          radius="md"
        >
          {t('redact.searchAndRedact.redactButton', 'Redact All Matches')}
        </Button>

        {/* Save Changes Button */}
        <Button
          fullWidth
          size="md"
          radius="md"
          variant="filled"
          color="blue"
          onClick={handleSaveChanges}
        >
          {t('annotation.saveChanges', 'Save Changes')}
        </Button>
      </Stack>
    </>
  );
}
