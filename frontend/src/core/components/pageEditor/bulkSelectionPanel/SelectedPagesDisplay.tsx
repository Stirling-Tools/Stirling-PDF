import { Text } from '@mantine/core';
import classes from '@app/components/pageEditor/bulkSelectionPanel/BulkSelectionPanel.module.css';

interface SelectedPagesDisplayProps {
  selectedPageIds: string[];
  displayDocument?: { pages: { id: string; pageNumber: number }[] };
  syntaxError: string | null;
}

const SelectedPagesDisplay = ({
  selectedPageIds,
  displayDocument,
  syntaxError,
}: SelectedPagesDisplayProps) => {
  if (selectedPageIds.length === 0 && !syntaxError) {
    return null;
  }

  return (
    <div className={classes.selectedList}>
      {syntaxError ? (
        <Text size="xs" className={classes.errorText}>{syntaxError}</Text>
      ) : (
        <Text size="sm" c="dimmed" className={classes.selectedText}>
          Selected: {selectedPageIds.length} pages ({displayDocument ? selectedPageIds.map(id => {
            const page = displayDocument.pages.find(p => p.id === id);
            return page?.pageNumber || 0;
          }).filter(n => n > 0).join(', ') : ''})
        </Text>
      )}
    </div>
  );
};

export default SelectedPagesDisplay;
