import React, { useMemo } from 'react';
import { Box, Stack, Text } from '@mantine/core';
import { type ToolRegistryEntry } from '../../data/toolRegistry';
import ToolButton from './toolPicker/ToolButton';

interface SearchResultsProps {
  filteredTools: [string, ToolRegistryEntry][];
  onSelect: (id: string) => void;
}

const SearchResults: React.FC<SearchResultsProps> = ({ filteredTools, onSelect }) => {
  const groups = useMemo(() => {
    const subMap: Record<string, Array<{ id: string; tool: ToolRegistryEntry }>> = {};
    const seen = new Set<string>();

    filteredTools.forEach(([id, tool]) => {
      if (seen.has(id)) return;
      seen.add(id);
      const sub = tool?.subcategory || 'General';
      if (!subMap[sub]) subMap[sub] = [];
      subMap[sub].push({ id, tool });
    });

    return Object.entries(subMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subcategory, tools]) => ({
        subcategory,
        tools
      }));
  }, [filteredTools]);

  if (groups.length === 0) {
    return (
      <Text c="dimmed" size="sm" p="sm">
        No tools found
      </Text>
    );
  }

  return (
    <Stack p="sm" gap="xs">
      {groups.map(group => (
        <Box key={group.subcategory} w="100%">
          <Text size="sm" fw={500} mb="0.25rem" mt="1rem" className="tool-subcategory-title">
            {group.subcategory}
          </Text>
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
          {/* bottom spacer within each group not strictly required, outer list can add a spacer if needed */}
        </Box>
      ))}
      {/* global spacer to allow scrolling past last row in search mode */}
      <div aria-hidden style={{ height: 44 * 4 }} />
    </Stack>
  );
};

export default SearchResults;


