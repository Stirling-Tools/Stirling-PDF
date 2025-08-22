import React, { useMemo } from 'react';
import { Box, Stack, Text } from '@mantine/core';
import { getSubcategoryLabel, ToolRegistryEntry } from '../../data/toolsTaxonomy';
import ToolButton from './toolPicker/ToolButton';
import { useTranslation } from 'react-i18next';
import { useToolSections } from '../../hooks/useToolSections';
import SubcategoryHeader from './shared/SubcategoryHeader';
import NoToolsFound from './shared/NoToolsFound';

interface SearchResultsProps {
  filteredTools: [string, ToolRegistryEntry][];
  onSelect: (id: string) => void;
}

const SearchResults: React.FC<SearchResultsProps> = ({ filteredTools, onSelect }) => {
  const { t } = useTranslation();
  const { searchGroups } = useToolSections(filteredTools);

  if (searchGroups.length === 0) {
    return <NoToolsFound />;
  }

  return (
    <Stack p="sm" gap="xs">
      {searchGroups.map(group => (
        <Box key={group.subcategoryId} w="100%">
          <SubcategoryHeader label={getSubcategoryLabel(t, group.subcategoryId)} />
          <Stack gap="xs">
            {group.tools.map(({ id, tool }) => (
              <ToolButton
                key={id}
                id={id}
                tool={tool}
                isSelected={false}
                onSelect={onSelect}
              />
            ))}
          </Stack>
        </Box>
      ))}
      {/* global spacer to allow scrolling past last row in search mode */}
      <div aria-hidden style={{ height: 200 }} />
    </Stack>
  );
};

export default SearchResults;


