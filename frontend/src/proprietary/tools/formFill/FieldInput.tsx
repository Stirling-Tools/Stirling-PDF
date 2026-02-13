/**
 * FieldInput: Shared, self-subscribing form field input widget.
 *
 * Used by both FormFill (left panel) and FormFieldSidebar (right panel).
 * Each instance subscribes to its own field value via useFieldValue(),
 * so only the active widget re-renders when its value changes.
 */
import React, { useCallback, memo } from 'react';
import {
  TextInput,
  Textarea,
  Checkbox,
  Radio,
  Select,
  MultiSelect,
  Stack,
} from '@mantine/core';
import { useFieldValue } from '@proprietary/tools/formFill/FormFillContext';
import type { FormField } from '@proprietary/tools/formFill/types';

function FieldInputInner({
  field,
  value,
  onValueChange,
}: {
  field: FormField;
  value: string;
  onValueChange: (fieldName: string, value: string) => void;
}) {
  const onChange = useCallback(
    (v: string) => onValueChange(field.name, v),
    [onValueChange, field.name]
  );

  switch (field.type) {
    case 'text':
      if (field.multiline) {
        return (
          <Textarea
            size="xs"
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            placeholder={field.tooltip || `Enter ${field.label}`}
            disabled={field.readOnly}
            autosize
            minRows={2}
            maxRows={5}
            styles={{ input: { fontSize: '0.8125rem' } }}
          />
        );
      }
      return (
        <TextInput
          size="xs"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder={field.tooltip || `Enter ${field.label}`}
          disabled={field.readOnly}
          styles={{ input: { fontSize: '0.8125rem' } }}
        />
      );

    case 'checkbox': {
      const isChecked = !!value && value !== 'Off';
      const onValue = (field.widgets && field.widgets[0]?.exportValue) || 'Yes';
      return (
        <Checkbox
          size="xs"
          checked={isChecked}
          onChange={(e) => onChange(e.currentTarget.checked ? onValue : 'Off')}
          label={field.label}
          disabled={field.readOnly}
        />
      );
    }

    case 'combobox': {
      const comboData = (field.options || []).map((opt, idx) => ({
        value: opt,
        label: (field.displayOptions && field.displayOptions[idx]) || opt,
      }));
      return (
        <Select
          size="xs"
          data={comboData}
          value={value || null}
          onChange={(v) => onChange(v || '')}
          placeholder={`Select ${field.label}`}
          clearable
          searchable
          disabled={field.readOnly}
          aria-label={field.label || field.name}
          aria-required={field.required}
          styles={{ input: { fontSize: '0.8125rem' } }}
        />
      );
    }

    case 'listbox': {
      const listData = (field.options || []).map((opt, idx) => ({
        value: opt,
        label: (field.displayOptions && field.displayOptions[idx]) || opt,
      }));
      if (field.multiSelect) {
        const selectedValues = value ? value.split(',').filter(Boolean) : [];
        return (
          <MultiSelect
            size="xs"
            data={listData}
            value={selectedValues}
            onChange={(vals) => onChange(vals.join(','))}
            placeholder={`Select ${field.label}`}
            searchable
            disabled={field.readOnly}
            aria-label={field.label || field.name}
            aria-required={field.required}
            styles={{ input: { fontSize: '0.8125rem' } }}
          />
        );
      }
      return (
        <Select
          size="xs"
          data={listData}
          value={value || null}
          onChange={(v) => onChange(v || '')}
          placeholder={`Select ${field.label}`}
          clearable
          searchable
          disabled={field.readOnly}
          aria-label={field.label || field.name}
          aria-required={field.required}
          styles={{ input: { fontSize: '0.8125rem' } }}
        />
      );
    }

    case 'radio': {
      const radioOptions: { value: string; label: string }[] = [];
      if (field.widgets && field.widgets.length > 0) {
        for (const w of field.widgets) {
          if (w.exportValue && !radioOptions.some((o) => o.value === w.exportValue)) {
            radioOptions.push({ value: w.exportValue, label: w.exportValue });
          }
        }
      }
      if (radioOptions.length === 0 && field.options) {
        radioOptions.push(...field.options.map((o) => ({ value: o, label: o })));
      }
      return (
        <Radio.Group
          value={value}
          onChange={onChange}
          aria-label={field.label || field.name}
          aria-required={field.required}
        >
          <Stack gap={4} mt={4}>
            {radioOptions.map((opt) => (
              <Radio
                key={opt.value}
                size="xs"
                value={opt.value}
                label={opt.label}
                disabled={field.readOnly}
              />
            ))}
          </Stack>
        </Radio.Group>
      );
    }

    default:
      return (
        <TextInput
          size="xs"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          disabled={field.readOnly}
          aria-label={field.label || field.name}
          aria-required={field.required}
          styles={{ input: { fontSize: '0.8125rem' } }}
        />
      );
  }
}

const FieldInputBase = memo(FieldInputInner);

/**
 * Self-subscribing FieldInput — reads its own value via useFieldValue.
 * Only re-renders when this specific field's value changes.
 */
export function FieldInput({
  field,
  onValueChange,
}: {
  field: FormField;
  onValueChange: (fieldName: string, value: string) => void;
}) {
  const value = useFieldValue(field.name);
  return <FieldInputBase field={field} value={value} onValueChange={onValueChange} />;
}

export default FieldInput;
