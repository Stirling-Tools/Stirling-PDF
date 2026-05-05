/**
 * Collapsible role section for the analysis review sidebar.
 * Shows a profile selector and expandable per-file field lists.
 */
import { useState } from 'react';
import {
  Stack,
  Group,
  Text,
  MultiSelect,
  Badge,
  Collapse,
  UnstyledButton,
} from '@mantine/core';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PersonIcon from '@mui/icons-material/Person';
import { FIELD_TYPE_ICON, FIELD_TYPE_COLOR } from '@app/tools/formFill/fieldMeta';
import type { FormField, FormFieldType } from '@app/tools/formFill/types';
import type { CrossFileRole, CleanedLabel } from './types';

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

interface SelectGroupItem {
  group: string;
  items: Array<{ value: string; label: string }>;
}

interface RoleSectionProps {
  role: CrossFileRole;
  entitySelectData: SelectGroupItem[];
  selectedEntityIds: string[];
  onEntitiesChange: (entityIds: string[]) => void;
  fieldsByFile: Record<string, FormField[]>;
  cleanedLabelsByFile: Record<string, CleanedLabel[]>;
  skippedFieldsByFile: Record<string, Set<string>>;
  fileNames: Record<string, string>;
  fileRoleOverrides: Record<string, Record<string, string[]>>;
  onFileOverride: (fileId: string, entityIds: string[]) => void;
}

export function RoleSection({
  role,
  entitySelectData,
  selectedEntityIds,
  onEntitiesChange,
  fieldsByFile,
  cleanedLabelsByFile,
  skippedFieldsByFile,
  fileNames,
  fileRoleOverrides,
  onFileOverride,
}: RoleSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const roleFieldNames = role.fieldNamesByFile;
  const fileCount = role.fileIds.length;
  const variantCount = selectedEntityIds.length;

  return (
    <Stack gap={4} style={{ borderBottom: '1px solid var(--mantine-color-default-border)', paddingBottom: 8 }}>
      {/* Role header */}
      <Group gap={8}>
        <PersonIcon sx={{ fontSize: 16, color: role.isPrimaryPerson ? 'var(--mantine-color-blue-6)' : 'var(--mantine-color-gray-6)' }} />
        <Text size="sm" fw={600} style={{ flex: 1 }}>
          {role.roleLabel}
        </Text>
        <Badge size="xs" variant="light">
          {fileCount} file{fileCount !== 1 ? 's' : ''}
        </Badge>
        {variantCount > 1 && (
          <Badge size="xs" variant="light" color="grape">×{variantCount}</Badge>
        )}
        {role.isPrimaryPerson && (
          <Badge size="xs" variant="light" color="blue">primary</Badge>
        )}
      </Group>

      {/* Entity selector — pick one or many. N entities = N filled outputs. */}
      <MultiSelect
        size="xs"
        data={entitySelectData}
        value={selectedEntityIds}
        onChange={onEntitiesChange}
        placeholder="Select entities..."
        searchable
        clearable
        styles={{ input: { fontSize: '0.8125rem' } }}
      />

      {/* Expand/collapse toggle */}
      <UnstyledButton onClick={() => setExpanded(!expanded)}>
        <Group gap={4}>
          {expanded ? <ExpandLessIcon sx={{ fontSize: 16 }} /> : <ExpandMoreIcon sx={{ fontSize: 16 }} />}
          <Text size="xs" c="dimmed">
            {expanded ? 'Hide fields' : `Show fields (${Object.values(roleFieldNames).flat().length})`}
          </Text>
        </Group>
      </UnstyledButton>

      {/* Expandable field list per file */}
      <Collapse in={expanded}>
        <Stack gap="xs" ml="sm">
          {role.fileIds.map((fileId) => {
            const fields = fieldsByFile[fileId] || [];
            const roleFields = new Set(roleFieldNames[fileId] || []);
            const skipped = skippedFieldsByFile[fileId] || new Set();
            const cleanedLabels = cleanedLabelsByFile[fileId] || [];
            const labelMap: Record<string, string> = {};
            for (const cl of cleanedLabels) labelMap[cl.fieldName] = cl.label;

            const visibleFields = fields.filter(
              (f) => roleFields.has(f.name) && !skipped.has(f.name) && !f.readOnly
            );

            const fileOverride = fileRoleOverrides[fileId]?.[role.roleLabel];

            return (
              <Stack key={fileId} gap={2}>
                {fileCount > 1 && (
                  <Group gap={4}>
                    <Text size="xs" fw={500} c="dimmed">{fileNames[fileId] || fileId}</Text>
                    {fileOverride && fileOverride.length > 0 && (
                      <Badge size="xs" variant="outline" color="orange">
                        override: {fileOverride.length === 1 ? fileOverride[0] : `${fileOverride.length} entities`}
                      </Badge>
                    )}
                    <MultiSelect
                      size="xs"
                      data={entitySelectData}
                      value={fileOverride || []}
                      onChange={(v) => onFileOverride(fileId, v)}
                      placeholder="Default"
                      clearable
                      searchable
                      styles={{ input: { fontSize: '0.75rem', minHeight: 24 }, root: { maxWidth: 220 } }}
                    />
                  </Group>
                )}
                {visibleFields.map((field) => {
                  const displayLabel = cleanPdfText(labelMap[field.name] || field.label || field.name);
                  const fieldType = field.type as FormFieldType;
                  const icon = FIELD_TYPE_ICON[fieldType];
                  const color = FIELD_TYPE_COLOR[fieldType] || 'gray';

                  return (
                    <Group key={field.name} gap={6} pl={4}>
                      <Text c={color} size="xs" lh={1}>{icon}</Text>
                      <Text size="xs">{displayLabel}</Text>
                      {field.required && <Badge size="xs" variant="light" color="red">req</Badge>}
                    </Group>
                  );
                })}
              </Stack>
            );
          })}
        </Stack>
      </Collapse>
    </Stack>
  );
}
