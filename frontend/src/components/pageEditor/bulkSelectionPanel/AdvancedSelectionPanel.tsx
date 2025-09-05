import { useState } from 'react';
import { Button, Text, NumberInput, Group } from '@mantine/core';
import classes from './BulkSelectionPanel.module.css';
import {
  appendExpression,
  insertOperatorSmart,
  firstNExpression,
  lastNExpression,
  everyNthExpression,
  rangeExpression,
} from './BulkSelection';

interface AdvancedSelectionPanelProps {
  csvInput: string;
  setCsvInput: (value: string) => void;
  onUpdatePagesFromCSV: (override?: string) => void;
  maxPages: number;
}

const AdvancedSelectionPanel = ({
  csvInput,
  setCsvInput,
  onUpdatePagesFromCSV,
  maxPages,
}: AdvancedSelectionPanelProps) => {
  const [advancedOpened, setAdvancedOpened] = useState<boolean>(false);
  const [firstNValue, setFirstNValue] = useState<number | ''>('');
  const [lastNValue, setLastNValue] = useState<number | ''>('');
  const [everyNthValue, setEveryNthValue] = useState<number | ''>('');
  const [rangeStart, setRangeStart] = useState<number | ''>('');
  const [rangeEnd, setRangeEnd] = useState<number | ''>('');
  const [firstNError, setFirstNError] = useState<string | null>(null);
  const [lastNError, setLastNError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const applyExpression = (expr: string) => {
    const nextInput = appendExpression(csvInput, expr);
    setCsvInput(nextInput);
    onUpdatePagesFromCSV(nextInput);
  };

  const insertOperator = (op: 'and' | 'or' | 'not') => {
    const next = insertOperatorSmart(csvInput, op);
    setCsvInput(next);
  };

  return (
    <>
      {/* Advanced button */}
      <div className={classes.dropdownContainer}>
        <Button 
          variant="light" 
          size="xs"
          onClick={() => setAdvancedOpened(!advancedOpened)}
        >
          Advanced
        </Button>
      </div>

      {/* Advanced section */}
      {advancedOpened && (
        <div className={classes.advancedSection}>
          <div className={classes.advancedHeader}>
            <Text size="sm" fw={500}>Advanced Selection</Text>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              onClick={() => setAdvancedOpened(false)}
              className={classes.closeButton}
            >
              ×
            </Button>
          </div>
          <div className={classes.advancedContent}>
            <div className={classes.leftCol}>
              {/* First N Pages - Card Style */}
              <div className={classes.advancedCard}>
                <Text size="sm" fw={600} c="gray.7" mb="sm">First N Pages</Text>
                {firstNError && (<Text size="xs" c="red" mb="xs">{firstNError}</Text>)}
                <div className={classes.inputGroup}>
                  <Text size="xs" c="gray.6" mb="xs">Number of pages:</Text>
                  <Group gap="sm" align="flex-end" wrap="nowrap">
                    <NumberInput
                      size="sm"
                      value={firstNValue}
                      onChange={(val) => {
                        const next = typeof val === 'number' ? val : '';
                        setFirstNValue(next);
                        if (next === '') setFirstNError(null);
                        else if (typeof next === 'number' && next <= 0) setFirstNError('Enter a positive number');
                        else setFirstNError(null);
                      }}
                      min={1}
                      placeholder="10"
                      className={classes.fullWidthInput}
                      error={Boolean(firstNError)}
                    />
                    <Button 
                      size="sm" 
                      className={classes.applyButton}
                      onClick={() => {
                        if (!firstNValue || typeof firstNValue !== 'number') return;
                        const expr = firstNExpression(firstNValue, maxPages);
                        if (expr) applyExpression(expr);
                        setFirstNValue('');
                      }} 
                      disabled={Boolean(firstNError) || firstNValue === ''}
                    >
                      Apply
                    </Button>
                  </Group>
                </div>
              </div>
              
              {/* Range - Card Style */}
              <div className={classes.advancedCard}>
                <Text size="sm" fw={600} c="gray.7" mb="sm">Range</Text>
                {rangeError && (<Text size="xs" c="red" mb="xs">{rangeError}</Text>)}
                <div className={classes.inputGroup}>
                  <Group gap="sm" align="flex-end" wrap="nowrap" mb="sm">
                    <div style={{ flex: 1 }}>
                      <Text size="xs" c="gray.6" mb="xs">From:</Text>
                      <NumberInput
                        size="sm"
                        value={rangeStart}
                        onChange={(val) => {
                          const next = typeof val === 'number' ? val : '';
                          setRangeStart(next);
                          const s = typeof next === 'number' ? next : null;
                          const e = typeof rangeEnd === 'number' ? rangeEnd : null;
                          if (s !== null && s <= 0) setRangeError('Values must be positive');
                          else if (s !== null && e !== null && s > e) setRangeError('From must be less than or equal to To');
                          else setRangeError(null);
                        }}
                        min={1}
                        placeholder="5"
                        error={Boolean(rangeError)}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Text size="xs" c="gray.6" mb="xs">To:</Text>
                      <NumberInput
                        size="sm"
                        value={rangeEnd}
                        onChange={(val) => {
                          const next = typeof val === 'number' ? val : '';
                          setRangeEnd(next);
                          const e = typeof next === 'number' ? next : null;
                          const s = typeof rangeStart === 'number' ? rangeStart : null;
                          if (e !== null && e <= 0) setRangeError('Values must be positive');
                          else if (s !== null && e !== null && s > e) setRangeError('From must be less than or equal to To');
                          else setRangeError(null);
                        }}
                        min={1}
                        placeholder="10"
                        error={Boolean(rangeError)}
                      />
                    </div>
                  </Group>
                  <Button 
                    size="sm" 
                    className={classes.applyButton}
                    onClick={() => {
                      if (
                        rangeStart === '' || rangeEnd === '' ||
                        typeof rangeStart !== 'number' || typeof rangeEnd !== 'number'
                      ) return;
                      const expr = rangeExpression(rangeStart, rangeEnd, maxPages);
                      if (expr) applyExpression(expr);
                      setRangeStart('');
                      setRangeEnd('');
                    }} 
                    disabled={Boolean(rangeError) || rangeStart === '' || rangeEnd === ''}
                  >
                    Apply
                  </Button>
                </div>
              </div>
              
              {/* Last N Pages - Card Style */}
              <div className={classes.advancedCard}>
                <Text size="sm" fw={600} c="gray.7" mb="sm">Last N Pages</Text>
                {lastNError && (<Text size="xs" c="red" mb="xs">{lastNError}</Text>)}
                <div className={classes.inputGroup}>
                  <Text size="xs" c="gray.6" mb="xs">Number of pages:</Text>
                  <Group gap="sm" align="flex-end" wrap="nowrap">
                    <NumberInput
                      size="sm"
                      value={lastNValue}
                      onChange={(val) => {
                        const next = typeof val === 'number' ? val : '';
                        setLastNValue(next);
                        if (next === '') setLastNError(null);
                        else if (typeof next === 'number' && next <= 0) setLastNError('Enter a positive number');
                        else setLastNError(null);
                      }}
                      min={1}
                      placeholder="10"
                      className={classes.fullWidthInput}
                      error={Boolean(lastNError)}
                    />
                    <Button 
                      size="sm" 
                      className={classes.applyButton}
                      onClick={() => {
                        if (!lastNValue || typeof lastNValue !== 'number') return;
                        const expr = lastNExpression(lastNValue, maxPages);
                        if (expr) applyExpression(expr);
                        setLastNValue('');
                      }} 
                      disabled={Boolean(lastNError) || lastNValue === ''}
                    >
                      Apply
                    </Button>
                  </Group>
                </div>
              </div>
              
              {/* Every Nth Page - Card Style */}
              <div className={classes.advancedCard}>
                <Text size="sm" fw={600} c="gray.7" mb="sm">Every Nth Page</Text>
                <div className={classes.inputGroup}>
                  <Text size="xs" c="gray.6" mb="xs">Step size:</Text>
                  <Group gap="sm" align="flex-end" wrap="nowrap">
                    <NumberInput 
                      size="sm" 
                      value={everyNthValue} 
                      onChange={(val) => setEveryNthValue(typeof val === 'number' ? val : '')} 
                      min={1} 
                      placeholder="5" 
                      className={classes.fullWidthInput}
                    />
                    <Button 
                      size="sm" 
                      className={classes.applyButton}
                      onClick={() => {
                        if (!everyNthValue || typeof everyNthValue !== 'number') return;
                        const expr = everyNthExpression(everyNthValue);
                        if (expr) applyExpression(expr);
                        setEveryNthValue('');
                      }} 
                      disabled={!everyNthValue}
                    >
                      Apply
                    </Button>
                  </Group>
                </div>
              </div>
            </div>
            <div className={classes.rightCol}>
              <Text size="xs" c="gray.6" fw={500} mb="sm">Add Operators:</Text>
              <div className={classes.operatorGroup}>
                <Button 
                  size="sm" 
                  variant="outline"
                  className={classes.operatorChip} 
                  onClick={() => insertOperator('and')}
                  disabled={!csvInput.trim()}
                  title="Combine selections (both conditions must be true)"
                >
                  <Text size="xs" fw={500}>and</Text>
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className={classes.operatorChip} 
                  onClick={() => insertOperator('or')}
                  disabled={!csvInput.trim()}
                  title="Add to selection (either condition can be true)"
                >
                  <Text size="xs" fw={500}>or</Text>
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className={classes.operatorChip} 
                  onClick={() => insertOperator('not')}
                  disabled={!csvInput.trim()}
                  title="Exclude from selection"
                >
                  <Text size="xs" fw={500}>not</Text>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdvancedSelectionPanel;
