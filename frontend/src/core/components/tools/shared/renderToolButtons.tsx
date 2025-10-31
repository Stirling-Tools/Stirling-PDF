import { Box } from '@mantine/core';
import ToolButton from '@app/components/tools/toolPicker/ToolButton';
import SubcategoryHeader from '@app/components/tools/shared/SubcategoryHeader';

import { getSubcategoryLabel } from "@app/data/toolsTaxonomy";
import { TFunction } from 'i18next';
import { SubcategoryGroup } from '@app/hooks/useToolSections';
import { ToolId } from "@app/types/toolId";

// Helper function to render tool buttons for a subcategory
export const renderToolButtons = <T extends ToolId>(
  t: TFunction,
  subcategory: SubcategoryGroup<T>,
  selectedToolKey: T | null,
  onSelect: (id: ToolId) => void,
  showSubcategoryHeader: boolean = true,
  disableNavigation: boolean = false,
  searchResults?: Array<{ item: [T, any]; matchedText?: string }>,
  hasStars: boolean = false
) => {
  // Create a map of matched text for quick lookup
  const matchedTextMap = new Map<T, string>();
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
              hasStars={hasStars}
            />
          );
        })}
      </div>
    </Box>
  );
};
