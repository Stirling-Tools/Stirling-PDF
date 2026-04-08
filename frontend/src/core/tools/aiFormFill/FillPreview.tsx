/**
 * Fill Preview — shows proposed field values before applying.
 * Each field shows: field name, value, source entity, accept/edit/reject toggle.
 */
import { useCallback } from 'react';
import {
  Stack,
  Group,
  Text,
  Checkbox,
  TextInput,
  Badge,
  Divider,
} from '@mantine/core';
import type { PreviewField } from './useBatchFormFillFlow';

function cleanPdfText(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/:plus:/g, ' ');
  cleaned = cleaned.replace(/\+/g, ' ');
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&#039;/g, "'");
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  try { cleaned = decodeURIComponent(cleaned); } catch { /* ignore */ }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

interface FillPreviewProps {
  fields: PreviewField[];
  fileNames: Record<string, string>;
  onToggle: (index: number) => void;
  onEdit: (index: number, value: string) => void;
}

export function FillPreview({ fields, fileNames, onToggle, onEdit }: FillPreviewProps) {
  // Group by file
  const fileGroups: Record<string, { fields: Array<PreviewField & { index: number }> }> = {};
  fields.forEach((field, index) => {
    if (!fileGroups[field.fileId]) fileGroups[field.fileId] = { fields: [] };
    fileGroups[field.fileId].fields.push({ ...field, index });
  });

  const acceptedCount = fields.filter((f) => f.accepted).length;

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed">
        {acceptedCount} of {fields.length} fields will be applied. Uncheck to skip, click value to edit.
      </Text>

      {Object.entries(fileGroups).map(([fileId, group]) => (
        <Stack key={fileId} gap={4}>
          <Text size="xs" fw={600}>{cleanPdfText(fileNames[fileId] || fileId)}</Text>
          {group.fields.map((field) => (
            <PreviewFieldRow
              key={field.index}
              field={field}
              index={field.index}
              onToggle={onToggle}
              onEdit={onEdit}
            />
          ))}
          <Divider />
        </Stack>
      ))}
    </Stack>
  );
}

function PreviewFieldRow({
  field,
  index,
  onToggle,
  onEdit,
}: {
  field: PreviewField;
  index: number;
  onToggle: (index: number) => void;
  onEdit: (index: number, value: string) => void;
}) {
  const handleEdit = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onEdit(index, e.currentTarget.value),
    [index, onEdit]
  );

  return (
    <Group gap={6} wrap="nowrap" pl="xs">
      <Checkbox
        size="xs"
        checked={field.accepted}
        onChange={() => onToggle(index)}
      />
      <Text size="xs" w={120} style={{ flexShrink: 0 }} c={field.accepted ? undefined : 'dimmed'}>
        {cleanPdfText(field.fieldName)}
      </Text>
      <TextInput
        size="xs"
        value={field.value}
        onChange={handleEdit}
        disabled={!field.accepted}
        style={{ flex: 1 }}
        styles={{ input: { fontSize: '0.75rem' } }}
      />
      <Badge size="xs" variant="light" color="blue" style={{ flexShrink: 0 }}>
        {field.entityName}
      </Badge>
    </Group>
  );
}
