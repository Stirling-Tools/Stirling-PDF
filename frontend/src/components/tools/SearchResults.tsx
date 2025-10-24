import React from 'react';
import { Box, Stack } from '@mantine/core';
import { getSubcategoryLabel, ToolRegistryEntry } from '../../data/toolsTaxonomy';
import { ToolId } from '../../types/toolId';
import ToolButton from './toolPicker/ToolButton';
import { useTranslation } from 'react-i18next';
import { useToolSections } from '../../hooks/useToolSections';
import SubcategoryHeader from './shared/SubcategoryHeader';
import NoToolsFound from './shared/NoToolsFound';
import "./toolPicker/ToolPicker.css";

interface SearchResultsProps {
  filteredTools: Array<{ item: [ToolId, ToolRegistryEntry]; matchedText?: string }>;
  onSelect: (id: ToolId) => void;
  searchQuery?: string;
}

const SearchResults: React.FC<SearchResultsProps> = ({ filteredTools, onSelect, searchQuery }) => {
  const { t } = useTranslation();
  const { searchGroups } = useToolSections(filteredTools, searchQuery);

  // Create a map of matched text for quick lookup
  const matchedTextMap = new Map<ToolId, string>();
  if (filteredTools && Array.isArray(filteredTools)) {
    filteredTools.forEach(({ item: [id], matchedText }) => {
      if (matchedText) matchedTextMap.set(id, matchedText);
    });
  }

  if (searchGroups.length === 0) {
    return <NoToolsFound />;
  }

  return (
    <Stack p="sm" gap="xs"
        className="tool-picker-scrollable">
      {searchGroups.map(group => (
        <Box key={group.subcategoryId}  w="100%">
          <SubcategoryHeader label={getSubcategoryLabel(t, group.subcategoryId)} />
          <Stack  gap="xs">
            {group.tools.map(({ id, tool }) => {
              const matchedText = matchedTextMap.get(id);
              // Check if the match was from synonyms and show the actual synonym that matched
              const isSynonymMatch = matchedText && tool.synonyms?.some(synonym =>
                matchedText.toLowerCase().includes(synonym.toLowerCase())
              );
              const matchedSynonym = isSynonymMatch ? tool.synonyms?.find(synonym =>
                matchedText.toLowerCase().includes(synonym.toLowerCase())
              ) : undefined;

              return (
                <ToolButton
                  key={id}
                  id={id}
                  tool={tool}
                  isSelected={false}
                  onSelect={onSelect}
                  matchedSynonym={matchedSynonym}
                />
              );
            })}
          </Stack>
        </Box>
      ))}
      {/* Global spacer to allow scrolling past last row in search mode */}
      <div aria-hidden style={{ height: 200 }} />
    </Stack>
  );
};

export default SearchResults;
