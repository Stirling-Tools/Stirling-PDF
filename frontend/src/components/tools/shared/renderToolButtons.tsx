import React from 'react';
import { Box } from '@mantine/core';
import ToolButton from '../toolPicker/ToolButton';
import SubcategoryHeader from './SubcategoryHeader';

import { getSubcategoryLabel } from "../../../data/toolsTaxonomy";
import { TFunction } from 'i18next';
import { SubcategoryGroup } from '../../../hooks/useToolSections';

// Helper function to render tool buttons for a subcategory
export const renderToolButtons = (
  t: TFunction,
  subcategory: SubcategoryGroup,
  selectedToolKey: string | null,
  onSelect: (id: string) => void,
  showSubcategoryHeader = true,
  disableNavigation = false,
  searchResults?: { item: [string, any]; matchedText?: string }[]
) => {
  // Create a map of matched text for quick lookup
  const matchedTextMap = new Map<string, string>();
  if (searchResults) {
    searchResults.forEach(({ item: [id], matchedText }) => {
      if (matchedText) matchedTextMap.set(id, matchedText);
    });
  }

  return (
    <Box key={subcategory.subcategoryId} w="100%">
      {showSubcategoryHeader && (
        <SubcategoryHeader label={getSubcategoryLabel(t, subcategory.subcategoryId)} />
      )}
      <div>
        {subcategory.tools.map(({ id, tool }) => {
          const matchedSynonym = matchedTextMap.get(id);
          
          return (
            <ToolButton
              key={id}
              id={id}
              tool={tool}
              isSelected={selectedToolKey === id}
              onSelect={onSelect}
              disableNavigation={disableNavigation}
              matchedSynonym={matchedSynonym}
            />
          );
        })}
      </div>
    </Box>
  );
};
