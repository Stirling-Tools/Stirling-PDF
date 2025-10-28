import { useState } from 'react';
import { Button, Text, NumberInput, Group } from '@mantine/core';
import classes from '@app/components/pageEditor/bulkSelectionPanel/BulkSelectionPanel.module.css';

interface SelectPagesProps {
  title: string;
  placeholder: string;
  onApply: (value: number) => void;
  maxPages: number;
  validationFn?: (value: number) => string | null;
  isRange?: boolean;
  rangeEndValue?: number | '';
  onRangeEndChange?: (value: string | number) => void;
  rangeEndPlaceholder?: string;
}

const SelectPages = ({
  title,
  placeholder,
  onApply,
  validationFn,
  isRange = false,
  rangeEndValue,
  onRangeEndChange,
  rangeEndPlaceholder,
}: SelectPagesProps) => {
  const [value, setValue] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  const handleValueChange = (val: string | number) => {
    const next = typeof val === 'number' ? val : '';
    setValue(next);
    
    if (validationFn && typeof next === 'number') {
      setError(validationFn(next));
    } else {
      setError(null);
    }
  };

  const handleApply = () => {
    if (value === '' || typeof value !== 'number') return;
    onApply(value);
    setValue('');
    setError(null);
  };

  const isDisabled = Boolean(error) || value === '';

  return (
    <div className={classes.advancedCard}>
      <Text size="sm" fw={600} c="var(--text-secondary)" mb="xs">{title}</Text>
      {error && (<Text size="xs" c="var(--text-brand-accent)" mb="xs">{error}</Text>)}
      <div className={classes.inputGroup}>
        <Group gap="sm" align="flex-end" wrap="nowrap">
          {isRange ? (
            <>
              <div style={{ flex: 1 }}>
                <NumberInput
                  size="sm"
                  value={value}
                  onChange={handleValueChange}
                  min={1}
                  placeholder={placeholder}
                  error={Boolean(error)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <NumberInput
                  size="sm"
                  value={rangeEndValue}
                  onChange={onRangeEndChange}
                  min={1}
                  placeholder={rangeEndPlaceholder}
                  error={Boolean(error)}
                />
              </div>
            </>
          ) : (
            <NumberInput
              size="sm"
              value={value}
              onChange={handleValueChange}
              min={1}
              placeholder={placeholder}
              className={classes.fullWidthInput}
              error={Boolean(error)}
            />
          )}
          <Button 
            size="sm" 
            className={classes.applyButton}
            onClick={handleApply}
            disabled={isDisabled}
          >
            Apply
          </Button>
        </Group>
      </div>
    </div>
  );
};

export default SelectPages;
