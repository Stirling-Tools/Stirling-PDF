import { useState } from 'react';
import { Flex } from '@mantine/core';
import classes from './BulkSelectionPanel.module.css';
import {
  appendExpression,
  insertOperatorSmart,
  firstNExpression,
  lastNExpression,
  everyNthExpression,
  rangeExpression,
} from './BulkSelection';
import SelectPages from './SelectPages';
import OperatorsSection from './OperatorsSection';

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

  const validateRangeEnd = (end: number): string | null => {
    if (end <= 0) return 'Values must be positive';
    return null;
  };

  // Named callback functions
  const applyExpression = (expr: string) => {
    const nextInput = appendExpression(csvInput, expr);
    setCsvInput(nextInput);
    onUpdatePagesFromCSV(nextInput);
  };

  const insertOperator = (op: 'and' | 'or' | 'not') => {
    const next = insertOperatorSmart(csvInput, op);
    setCsvInput(next);
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
                title="First N Pages"
                placeholder="Number of pages"
                onApply={handleFirstNApply}
                maxPages={maxPages}
                validationFn={validatePositiveNumber}
              />
              
              <SelectPages
                title="Range"
                placeholder="From"
                onApply={handleRangeApply}
                maxPages={maxPages}
                validationFn={validateRangeStart}
                isRange={true}
                rangeEndValue={rangeEnd}
                onRangeEndChange={handleRangeEndChange}
                rangeEndPlaceholder="To"
              />
              
              <SelectPages
                title="Last N Pages"
                placeholder="Number of pages"
                onApply={handleLastNApply}
                maxPages={maxPages}
                validationFn={validatePositiveNumber}
              />
              
              <SelectPages
                title="Every Nth Page"
                placeholder="Step size"
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
