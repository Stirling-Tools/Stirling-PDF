import { useState, useEffect } from 'react';
import classes from './bulkSelectionPanel/BulkSelectionPanel.module.css';
import { parseSelectionWithDiagnostics } from '../../utils/bulkselection/parseSelection';
import PageSelectionInput from './bulkSelectionPanel/PageSelectionInput';
import SelectedPagesDisplay from './bulkSelectionPanel/SelectedPagesDisplay';
import AdvancedSelectionPanel from './bulkSelectionPanel/AdvancedSelectionPanel';

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
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [advancedOpened, setAdvancedOpened] = useState<boolean>(false);
  const maxPages = displayDocument?.pages?.length ?? 0;


  // Validate input syntax and show lightweight feedback
  useEffect(() => {
    const text = (csvInput || '').trim();
    if (!text) {
      setSyntaxError(null);
      return;
    }
    try {
      const { warning } = parseSelectionWithDiagnostics(text, maxPages);
      setSyntaxError(warning ? 'There is a syntax issue. See Page Selection tips for help.' : null);
    } catch {
      setSyntaxError('There is a syntax issue. See Page Selection tips for help.');
    }
  }, [csvInput, maxPages]);

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

      <SelectedPagesDisplay
        selectedPageIds={selectedPageIds}
        displayDocument={displayDocument}
        syntaxError={syntaxError}
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