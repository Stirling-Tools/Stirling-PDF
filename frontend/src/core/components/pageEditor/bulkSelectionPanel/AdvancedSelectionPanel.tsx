import { useState } from 'react';
import { Flex } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import classes from '@app/components/pageEditor/bulkSelectionPanel/BulkSelectionPanel.module.css';
import {
  appendExpression,
  insertOperatorSmart,
  firstNExpression,
  lastNExpression,
  everyNthExpression,
  rangeExpression,
  LogicalOperator,
} from '@app/utils/bulkselection/selectionBuilders';
import SelectPages from '@app/components/pageEditor/bulkSelectionPanel/SelectPages';
import OperatorsSection from '@app/components/pageEditor/bulkSelectionPanel/OperatorsSection';

interface AdvancedSelectionPanelProps {
  csvInput: string;
  setCsvInput: (value: string) => void;
  onUpdatePagesFromCSV: (override?: string) => void;
  maxPages: number;
  advancedOpened?: boolean;
}

const AdvancedSelectionPanel = ({
  csvInput,
  setCsvInput,
  onUpdatePagesFromCSV,
  maxPages,
  advancedOpened,
}: AdvancedSelectionPanelProps) => {
  const { t } = useTranslation();
  const [rangeEnd, setRangeEnd] = useState<number | ''>('');

  const handleRangeEndChange = (val: string | number) => {
    const next = typeof val === 'number' ? val : '';
    setRangeEnd(next);
  };

  // Named validation functions
  const validatePositiveNumber = (value: number): string | null => {
    return value <= 0 ? 'Enter a positive number' : null;
  };

  const validateRangeStart = (start: number): string | null => {
    if (start <= 0) return 'Values must be positive';
    if (typeof rangeEnd === 'number' && start > rangeEnd) {
      return 'From must be less than or equal to To';
    }
    return null;
  };

  // Named callback functions
  const applyExpression = (expr: string) => {
    const nextInput = appendExpression(csvInput, expr);
    setCsvInput(nextInput);
    onUpdatePagesFromCSV(nextInput);
  };

  const insertOperator = (op: LogicalOperator) => {
    const next = insertOperatorSmart(csvInput, op);
    setCsvInput(next);
    // Trigger visual selection update for 'even' and 'odd' operators
    if (op === 'even' || op === 'odd') {
      onUpdatePagesFromCSV(next);
    }
  };

  const handleFirstNApply = (value: number) => {
    const expr = firstNExpression(value, maxPages);
    if (expr) applyExpression(expr);
  };

  const handleLastNApply = (value: number) => {
    const expr = lastNExpression(value, maxPages);
    if (expr) applyExpression(expr);
  };

  const handleEveryNthApply = (value: number) => {
    const expr = everyNthExpression(value);
    if (expr) applyExpression(expr);
  };

  const handleRangeApply = (start: number) => {
    if (typeof rangeEnd !== 'number') return;
    const expr = rangeExpression(start, rangeEnd, maxPages);
    if (expr) applyExpression(expr);
    setRangeEnd('');
  };

  return (
    <>
      {/* Advanced section */}
      {advancedOpened && (
        <div className={classes.advancedSection}>
          <div className={classes.advancedContent}>
            {/* Cards row */}
            <Flex direction="row" mb="xs" wrap="wrap">
              <SelectPages
                title={t('bulkSelection.firstNPages.title', 'First N Pages')}
                placeholder={t('bulkSelection.firstNPages.placeholder', 'Number of pages')}
                onApply={handleFirstNApply}
                maxPages={maxPages}
                validationFn={validatePositiveNumber}
              />
              
              <SelectPages
                title={t('bulkSelection.range.title', 'Range')}
                placeholder={t('bulkSelection.range.fromPlaceholder', 'From')}
                onApply={handleRangeApply}
                maxPages={maxPages}
                validationFn={validateRangeStart}
                isRange={true}
                rangeEndValue={rangeEnd}
                onRangeEndChange={handleRangeEndChange}
                rangeEndPlaceholder={t('bulkSelection.range.toPlaceholder', 'To')}
              />
              
              <SelectPages
                title={t('bulkSelection.lastNPages.title', 'Last N Pages')}
                placeholder={t('bulkSelection.lastNPages.placeholder', 'Number of pages')}
                onApply={handleLastNApply}
                maxPages={maxPages}
                validationFn={validatePositiveNumber}
              />
              
              <SelectPages
                title={t('bulkSelection.everyNthPage.title', 'Every Nth Page')}
                placeholder={t('bulkSelection.everyNthPage.placeholder', 'Step size')}
                onApply={handleEveryNthApply}
                maxPages={maxPages}
              />
            </Flex>
            
            {/* Operators row at bottom */}
            <OperatorsSection
              csvInput={csvInput}
              onInsertOperator={insertOperator}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default AdvancedSelectionPanel;
