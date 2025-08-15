import React, { useMemo } from 'react';
import { Box, Stack, Text } from '@mantine/core';
import { type ToolRegistryEntry } from '../../data/toolRegistry';
import ToolButton from './toolPicker/ToolButton';

interface SearchResultsProps {
  filteredTools: [string, ToolRegistryEntry][];
  onSelect: (id: string) => void;
}

const SearchResults: React.FC<SearchResultsProps> = ({ filteredTools, onSelect }) => {
  // Group tools by subcategory and remove duplicates
  const groupedToolsByCategory = useMemo(() => {
    const categoryToToolsMap: Record<string, Array<{ id: string; tool: ToolRegistryEntry }>> = {};
    const processedToolIds = new Set<string>();

    // Process each tool, skipping duplicates and grouping by subcategory
    filteredTools.forEach(([toolId, toolEntry]) => {
      // Skip if we've already processed this tool ID (deduplication)
      if (processedToolIds.has(toolId)) return;
      processedToolIds.add(toolId);
      
      // Use subcategory or default to 'General' if not specified
      const categoryName = toolEntry?.subcategory || 'General';
      
      // Initialize category array if it doesn't exist
      if (!categoryToToolsMap[categoryName]) {
        categoryToToolsMap[categoryName] = [];
      }
      
      categoryToToolsMap[categoryName].push({ id: toolId, tool: toolEntry });
    });

    // Convert to sorted array format for rendering
    return Object.entries(categoryToToolsMap)
      .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
      .map(([categoryName, toolsInCategory]) => ({
        categoryName,
        toolsInCategory
      }));
  }, [filteredTools]);

  if (groupedToolsByCategory.length === 0) {
    return (
      <Text c="dimmed" size="sm" p="sm">
        No tools found
      </Text>
    );
  }

  return (
    <Stack p="sm" gap="xs">
      {groupedToolsByCategory.map(categoryGroup => (
        <Box key={categoryGroup.categoryName} w="100%">
          <Text size="sm" fw={500} mb="0.25rem" mt="1rem" className="tool-subcategory-title">
            {categoryGroup.categoryName}
          </Text>
          <Stack gap="xs">
            {categoryGroup.toolsInCategory.map(({ id, tool }) => (
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
      <div aria-hidden style={{ height: 200 }} />
    </Stack>
  );
};

export default SearchResults;


