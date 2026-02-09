/**
 * FormFieldSidebar — A right-side panel that lists all form fields
 * and allows the user to fill them in. Changes propagate in real-time
 * to the PDF overlay widgets.
 */
import React, { useCallback, useEffect, useRef, memo } from 'react';
import {
  Box,
  Text,
  TextInput,
  Textarea,
  Checkbox,
  Select,
  MultiSelect,
  ScrollArea,
  Badge,
  Tooltip,
  Stack,
  Group,
  Divider,
  ActionIcon,
  Paper,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useFormFill } from './FormFillContext';
import type { FormField, FormFieldType } from './types';
import CloseIcon from '@mui/icons-material/Close';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import ArrowDropDownCircleIcon from '@mui/icons-material/ArrowDropDownCircle';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import ListIcon from '@mui/icons-material/List';
import DrawIcon from '@mui/icons-material/Draw';

interface FormFieldSidebarProps {
  visible: boolean;
  onToggle: () => void;
}

const FIELD_TYPE_ICON: Record<FormFieldType, React.ReactNode> = {
  text: <TextFieldsIcon sx={{ fontSize: 16 }} />,
  checkbox: <CheckBoxIcon sx={{ fontSize: 16 }} />,
  combobox: <ArrowDropDownCircleIcon sx={{ fontSize: 16 }} />,
  listbox: <ListIcon sx={{ fontSize: 16 }} />,
  radio: <RadioButtonCheckedIcon sx={{ fontSize: 16 }} />,
  button: <DrawIcon sx={{ fontSize: 16 }} />,
  signature: <DrawIcon sx={{ fontSize: 16 }} />,
};

const FIELD_TYPE_COLOR: Record<FormFieldType, string> = {
  text: 'blue',
  checkbox: 'green',
  combobox: 'violet',
  listbox: 'cyan',
  radio: 'orange',
  button: 'gray',
  signature: 'pink',
};

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
            maxRows={6}
            style={{ flex: 1 }}
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
          style={{ flex: 1 }}
        />
      );

    case 'checkbox': {
      // Checkbox is checked when value is anything other than 'Off' or empty
      const isChecked = !!value && value !== 'Off';
      // Use the first widget's exportValue for the on-value, or fall back to 'Yes'
      const onValue = (field.widgets && field.widgets[0]?.exportValue) || 'Yes';
      return (
        <Checkbox
          size="xs"
          checked={isChecked}
          onChange={(e) =>
            onChange(e.currentTarget.checked ? onValue : 'Off')
          }
          label={field.label}
          disabled={field.readOnly}
        />
      );
    }

    case 'combobox': {
      // Build data with separate value/label when display options differ
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
          style={{ flex: 1 }}
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
            style={{ flex: 1 }}
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
          style={{ flex: 1 }}
        />
      );
    }

    case 'radio': {
      // Derive radio options from widget exportValues (most reliable),
      // falling back to field.options
      const radioOptions: string[] = [];
      if (field.widgets && field.widgets.length > 0) {
        for (const w of field.widgets) {
          if (w.exportValue && !radioOptions.includes(w.exportValue)) {
            radioOptions.push(w.exportValue);
          }
        }
      }
      if (radioOptions.length === 0 && field.options) {
        radioOptions.push(...field.options);
      }
      return (
        <Stack gap={4}>
          {radioOptions.map((opt) => (
            <Checkbox
              key={opt}
              size="xs"
              label={opt}
              checked={value === opt}
              onChange={() => onChange(value === opt ? 'Off' : opt)}
              disabled={field.readOnly}
              styles={{ input: { borderRadius: '50%' } }}
            />
          ))}
        </Stack>
      );
    }

    default:
      return (
        <TextInput
          size="xs"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          disabled={field.readOnly}
          style={{ flex: 1 }}
        />
      );
  }
}

const FieldInput = memo(FieldInputInner);

export function FormFieldSidebar({
  visible,
  onToggle,
}: FormFieldSidebarProps) {
  const { t } = useTranslation();
  const { state, setValue, setActiveField } = useFormFill();
  const { fields, values, activeFieldName, loading } = state;
  const activeFieldRef = useRef<HTMLDivElement>(null);

  // Scroll the active field into view in the sidebar
  useEffect(() => {
    if (activeFieldName && activeFieldRef.current) {
      activeFieldRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeFieldName]);

  const handleFieldClick = useCallback(
    (fieldName: string) => {
      setActiveField(fieldName);
    },
    [setActiveField]
  );

  const handleValueChange = useCallback(
    (fieldName: string, value: string) => {
      setValue(fieldName, value);
    },
    [setValue]
  );

  if (!visible) return null;

  // Group fields by page
  const fieldsByPage = new Map<number, FormField[]>();
  for (const field of fields) {
    // Use the first widget's page
    const pageIndex =
      field.widgets && field.widgets.length > 0 ? field.widgets[0].pageIndex : 0;
    if (!fieldsByPage.has(pageIndex)) {
      fieldsByPage.set(pageIndex, []);
    }
    fieldsByPage.get(pageIndex)!.push(field);
  }
  const sortedPages = Array.from(fieldsByPage.keys()).sort(
    (a, b) => a - b
  );

  const sidebarWidth = '18rem';

  return (
    <Box
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: sidebarWidth,
        height: '100%',
        zIndex: 999,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--mantine-color-body)',
        borderLeft: '1px solid var(--mantine-color-default-border)',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
      }}
    >
      {/* Header */}
      <Group
        justify="space-between"
        p="xs"
        style={{
          borderBottom:
            '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Group gap="xs">
          <TextFieldsIcon sx={{ fontSize: 18 }} />
          <Text fw={600} size="sm">
            Form Fields
          </Text>
          <Badge size="xs" variant="light" color="blue">
            {fields.length}
          </Badge>
        </Group>
        <ActionIcon variant="subtle" size="sm" onClick={onToggle}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </ActionIcon>
      </Group>

      {/* Content */}
      <ScrollArea style={{ flex: 1 }} p="xs">
        {loading && (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            Loading form fields…
          </Text>
        )}

        {!loading && fields.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            No form fields found in this PDF
          </Text>
        )}

        {!loading && fields.length > 0 && (
          <Stack gap="xs">
            {sortedPages.map((pageIdx) => (
              <React.Fragment key={pageIdx}>
                <Divider
                  label={
                    <Text size="xs" fw={500} c="dimmed">
                      Page {pageIdx + 1}
                    </Text>
                  }
                  labelPosition="left"
                />
                {fieldsByPage.get(pageIdx)!.map((field) => {
                  const isActive =
                    activeFieldName === field.name;
                  return (
                    <Paper
                      key={field.name}
                      ref={
                        isActive ? activeFieldRef : undefined
                      }
                      p="xs"
                      withBorder
                      shadow={isActive ? 'sm' : undefined}
                      style={{
                        cursor: 'pointer',
                        borderColor: isActive
                          ? 'var(--mantine-color-blue-5)'
                          : undefined,
                        borderWidth: isActive ? 2 : 1,
                        background: isActive
                          ? 'var(--mantine-color-blue-light)'
                          : undefined,
                        transition: 'all 0.15s ease',
                      }}
                      onClick={() =>
                        handleFieldClick(field.name)
                      }
                    >
                      {/* Field header */}
                      <Group
                        gap="xs"
                        mb={4}
                        wrap="nowrap"
                      >
                        <Tooltip label={field.type}>
                          <Box
                            style={{
                              color: `var(--mantine-color-${FIELD_TYPE_COLOR[field.type]}-6)`,
                              display: 'flex',
                            }}
                          >
                            {FIELD_TYPE_ICON[field.type]}
                          </Box>
                        </Tooltip>
                        <Text
                          size="xs"
                          fw={500}
                          truncate
                          style={{ flex: 1 }}
                        >
                          {field.label || field.name}
                        </Text>
                        {field.required && (
                          <Badge
                            size="xs"
                            color="red"
                            variant="light"
                          >
                            *
                          </Badge>
                        )}
                      </Group>

                      {/* Field input */}
                      {field.type !== 'button' &&
                        field.type !== 'signature' && (
                          <FieldInput
                            field={field}
                            value={
                              values[field.name] ?? ''
                            }
                            onValueChange={handleValueChange}
                          />
                        )}

                      {/* Tooltip hint */}
                      {field.tooltip && (
                        <Text
                          size="xs"
                          c="dimmed"
                          mt={2}
                          truncate
                        >
                          {field.tooltip}
                        </Text>
                      )}
                    </Paper>
                  );
                })}
              </React.Fragment>
            ))}
          </Stack>
        )}
      </ScrollArea>
    </Box>
  );
}

export default FormFieldSidebar;
