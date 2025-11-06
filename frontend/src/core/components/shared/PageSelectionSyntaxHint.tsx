import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@mantine/core';
import classes from '@app/components/pageEditor/bulkSelectionPanel/BulkSelectionPanel.module.css';
import { parseSelectionWithDiagnostics } from '@app/utils/bulkselection/parseSelection';

interface PageSelectionSyntaxHintProps {
  input: string;
  /** Optional known page count; if not provided, a large max is used for syntax-only checks */
  maxPages?: number;
  /** panel = full bulk panel style, compact = inline tool style */
  variant?: 'panel' | 'compact';
}

const FALLBACK_MAX_PAGES = 100000; // large upper bound for syntax validation without a document

const PageSelectionSyntaxHint = ({ input, maxPages, variant = 'panel' }: PageSelectionSyntaxHintProps) => {
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const text = (input || '').trim();
    if (!text) {
      setSyntaxError(null);
      return;
    }

    try {
      const { warning } = parseSelectionWithDiagnostics(text, maxPages && maxPages > 0 ? maxPages : FALLBACK_MAX_PAGES);
      setSyntaxError(warning ? t('bulkSelection.syntaxError', 'There is a syntax issue. See Page Selection tips for help.') : null);
    } catch {
      setSyntaxError(t('bulkSelection.syntaxError', 'There is a syntax issue. See Page Selection tips for help.'));
    }
  }, [input, maxPages]);

  if (!syntaxError) return null;

  return (
    <div className={variant === 'panel' ? classes.selectedList : classes.errorCompact}>
      <Text size="xs" className={variant === 'panel' ? classes.errorText : classes.errorTextClamp}>{syntaxError}</Text>
    </div>
  );
};

export default PageSelectionSyntaxHint;


