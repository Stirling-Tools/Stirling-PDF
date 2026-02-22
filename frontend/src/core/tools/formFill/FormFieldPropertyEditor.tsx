/**
 * FormFieldPropertyEditor — Shared property editor for form field definitions.
 * Used by both FormFieldCreatePanel (create mode) and FormFieldModifyPanel (modify mode).
 */
import React from 'react';
import {
  TextInput,
  NumberInput,
  Select,
  Switch,
  Text,
  ActionIcon,
  Button,
  Stack,
  SimpleGrid,
} from '@mantine/core';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import type { FormFieldType, NewFieldDefinition } from '@app/tools/formFill/types';

interface FormFieldPropertyEditorProps {
  field: NewFieldDefinition;
  onChange: (updated: NewFieldDefinition) => void;
  /** Whether to allow changing the field type (true in modify mode) */
  allowTypeChange?: boolean;
  /** Whether coordinates are read-only display */
  showCoordinates?: boolean;
  /** When provided, coordinate section renders editable NumberInputs */
  onCoordsChange?: (coords: { x: number; y: number; width: number; height: number }) => void;
}

const FIELD_TYPE_OPTIONS: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Text Field' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'combobox', label: 'Dropdown' },
  { value: 'listbox', label: 'List Box' },
];

export function FormFieldPropertyEditor({
  field,
  onChange,
  allowTypeChange = false,
  showCoordinates = false,
  onCoordsChange,
}: FormFieldPropertyEditorProps) {
  const hasOptions = field.type === 'combobox' || field.type === 'listbox';

  return (
    <Stack gap="xs">
      <TextInput
        label="Name"
        size="xs"
        value={field.name}
        onChange={(e) => onChange({ ...field, name: e.currentTarget.value })}
        placeholder="Field name"
      />

      <TextInput
        label="Label"
        size="xs"
        value={field.label || ''}
        onChange={(e) => onChange({ ...field, label: e.currentTarget.value || undefined })}
        placeholder="Display label"
      />

      {allowTypeChange && (
        <Select
          label="Type"
          size="xs"
          data={FIELD_TYPE_OPTIONS}
          value={field.type}
          onChange={(val) => {
            if (val) onChange({ ...field, type: val as FormFieldType });
          }}
        />
      )}

      <TextInput
        label="Tooltip"
        size="xs"
        value={field.tooltip || ''}
        onChange={(e) => onChange({ ...field, tooltip: e.currentTarget.value || undefined })}
        placeholder="Help text"
      />

      <TextInput
        label="Default Value"
        size="xs"
        value={field.defaultValue || ''}
        onChange={(e) => onChange({ ...field, defaultValue: e.currentTarget.value || undefined })}
        placeholder="Default value"
      />

      <NumberInput
        label="Font Size (pt)"
        size="xs"
        value={field.fontSize ?? ''}
        onChange={(val) => onChange({ ...field, fontSize: typeof val === 'number' ? val : undefined })}
        placeholder="12 (default)"
        min={4}
        max={72}
        step={1}
      />

      <Switch
        label="Required"
        size="xs"
        checked={field.required || false}
        onChange={(e) => onChange({ ...field, required: e.currentTarget.checked })}
        styles={{ label: { fontSize: '0.75rem', cursor: 'pointer' } }}
      />

      <Switch
        label="Read-only"
        size="xs"
        checked={field.readOnly || false}
        onChange={(e) => onChange({ ...field, readOnly: e.currentTarget.checked })}
        styles={{ label: { fontSize: '0.75rem', cursor: 'pointer' } }}
      />

      {field.type === 'text' && (
        <Switch
          label="Multiline"
          size="xs"
          checked={field.multiline || false}
          onChange={(e) => onChange({ ...field, multiline: e.currentTarget.checked })}
          styles={{ label: { fontSize: '0.75rem', cursor: 'pointer' } }}
        />
      )}

      {hasOptions && (
        <div>
          <Text size="xs" fw={500} mb={4}>Options</Text>
          {(field.options || []).map((opt, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <TextInput
                size="xs"
                value={opt}
                onChange={(e) => {
                  const newOpts = [...(field.options || [])];
                  newOpts[idx] = e.currentTarget.value;
                  onChange({ ...field, options: newOpts });
                }}
                style={{ flex: 1 }}
                placeholder={`Option ${idx + 1}`}
              />
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => {
                  const newOpts = (field.options || []).filter((_, i) => i !== idx);
                  onChange({ ...field, options: newOpts });
                }}
              >
                <DeleteIcon sx={{ fontSize: 14 }} />
              </ActionIcon>
            </div>
          ))}
          <Button
            variant="subtle"
            size="xs"
            leftSection={<AddIcon sx={{ fontSize: 14 }} />}
            onClick={() => {
              onChange({ ...field, options: [...(field.options || []), ''] });
            }}
          >
            Add Option
          </Button>
        </div>
      )}

      {field.type === 'listbox' && (
        <Switch
          label="Multi-select"
          size="xs"
          checked={field.multiSelect || false}
          onChange={(e) => onChange({ ...field, multiSelect: e.currentTarget.checked })}
          styles={{ label: { fontSize: '0.75rem', cursor: 'pointer' } }}
        />
      )}

      {showCoordinates && !onCoordsChange && (
        <div>
          <Text size="xs" fw={500} c="dimmed" mb={2}>Position</Text>
          <Text size="xs" c="dimmed">
            Page {field.pageIndex + 1} &middot; ({Math.round(field.x)}, {Math.round(field.y)}) &middot; {Math.round(field.width)} &times; {Math.round(field.height)} pt
          </Text>
        </div>
      )}

      {showCoordinates && onCoordsChange && (
        <div>
          <Text size="xs" fw={500} c="dimmed" mb={4}>Position &amp; Size (PDF points)</Text>
          <SimpleGrid cols={2} spacing={4}>
            <NumberInput
              label="X"
              size="xs"
              value={field.x}
              onChange={(val) => {
                if (typeof val === 'number') {
                  onCoordsChange({ x: val, y: field.y, width: field.width, height: field.height });
                }
              }}
              step={1}
              decimalScale={1}
            />
            <NumberInput
              label="Y"
              size="xs"
              value={field.y}
              onChange={(val) => {
                if (typeof val === 'number') {
                  onCoordsChange({ x: field.x, y: val, width: field.width, height: field.height });
                }
              }}
              step={1}
              decimalScale={1}
            />
            <NumberInput
              label="Width"
              size="xs"
              value={field.width}
              onChange={(val) => {
                if (typeof val === 'number' && val > 0) {
                  onCoordsChange({ x: field.x, y: field.y, width: val, height: field.height });
                }
              }}
              min={1}
              step={1}
              decimalScale={1}
            />
            <NumberInput
              label="Height"
              size="xs"
              value={field.height}
              onChange={(val) => {
                if (typeof val === 'number' && val > 0) {
                  onCoordsChange({ x: field.x, y: field.y, width: field.width, height: val });
                }
              }}
              min={1}
              step={1}
              decimalScale={1}
            />
          </SimpleGrid>
        </div>
      )}
    </Stack>
  );
}
