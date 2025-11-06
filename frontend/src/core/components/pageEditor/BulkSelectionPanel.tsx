import { useState } from 'react';
import classes from '@app/components/pageEditor/bulkSelectionPanel/BulkSelectionPanel.module.css';
import PageSelectionInput from '@app/components/pageEditor/bulkSelectionPanel/PageSelectionInput';
import SelectedPagesDisplay from '@app/components/pageEditor/bulkSelectionPanel/SelectedPagesDisplay';
import PageSelectionSyntaxHint from '@app/components/shared/PageSelectionSyntaxHint';
import AdvancedSelectionPanel from '@app/components/pageEditor/bulkSelectionPanel/AdvancedSelectionPanel';

interface BulkSelectionPanelProps {
  csvInput: string;
  setCsvInput: (value: string) => void;
  selectedPageIds: string[];
  displayDocument?: { pages: { id: string; pageNumber: number }[] };
  onUpdatePagesFromCSV: (override?: string) => void;
}

const BulkSelectionPanel = ({
  csvInput,
  setCsvInput,
  selectedPageIds,
  displayDocument,
  onUpdatePagesFromCSV,
}: BulkSelectionPanelProps) => {
  const [advancedOpened, setAdvancedOpened] = useState<boolean>(false);
  const maxPages = displayDocument?.pages?.length ?? 0;

  const handleClear = () => {
    setCsvInput('');
    onUpdatePagesFromCSV('');
  };

  return (
    <div className={classes.panelContainer}>
      <PageSelectionInput
        csvInput={csvInput}
        setCsvInput={setCsvInput}
        onUpdatePagesFromCSV={onUpdatePagesFromCSV}
        onClear={handleClear}
        advancedOpened={advancedOpened}
        onToggleAdvanced={setAdvancedOpened}
      />

      <PageSelectionSyntaxHint input={csvInput} maxPages={maxPages} variant="panel" />

      <SelectedPagesDisplay
        selectedPageIds={selectedPageIds}
        displayDocument={displayDocument}
        syntaxError={null}
      />

      <AdvancedSelectionPanel
        csvInput={csvInput}
        setCsvInput={setCsvInput}
        onUpdatePagesFromCSV={onUpdatePagesFromCSV}
        maxPages={maxPages}
        advancedOpened={advancedOpened}
      />
    </div>
  );
};

export default BulkSelectionPanel;