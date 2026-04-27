/**
 * Entities tab — two-column layout: entity list grouped by type (left) + fields table (right).
 */
import { useState, useCallback, useMemo } from 'react';
import {
  Stack,
  Group,
  Text,
  Button,
  TextInput,
  ActionIcon,
  NavLink,
  Badge,
  Table,
  Menu,
  Select,
  Alert,
} from '@mantine/core';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AddIcon from '@mui/icons-material/Add';
import { ALL_ENTITY_TYPES, ENTITY_TYPE_LABELS, type EntityType } from './entityTypes';
import type { EntityStore } from './useEntityStore';
import {
  exportEntitiesToJson,
  downloadJson,
  importEntitiesFromJson,
  importCsvToStore,
} from './entityImportExport';
import { checkExpiryDates } from './workflowTemplates';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

export function EntitiesTab({ store }: { store: EntityStore }) {
  const [selectedId, setSelectedId] = useState<string | null>(store.defaultEntityId);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<EntityType>('person');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const selectedEntity = selectedId ? store.getEntity(selectedId) : undefined;
  const entries = selectedEntity
    ? Object.entries(selectedEntity.fields).filter(([k]) => !k.startsWith('_'))
    : [];

  const handleCreate = useCallback(() => {
    const name = newName.trim();
    if (name) {
      const entity = store.createEntity(newType, name);
      setSelectedId(entity.id);
      setNewName('');
    }
  }, [newName, newType, store]);

  const handleRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      store.updateEntity(renamingId, { name: renameValue.trim() });
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, store]);

  const handleSaveEdit = useCallback(
    (key: string) => {
      if (selectedId) store.setField(selectedId, key, editValue);
      setEditingKey(null);
      setEditValue('');
    },
    [selectedId, editValue, store]
  );

  const typeSelectData = ALL_ENTITY_TYPES.map((t) => ({
    value: t,
    label: ENTITY_TYPE_LABELS[t],
  }));

  const expiryWarnings = useMemo(
    () => checkExpiryDates(store.entities),
    [store.entities],
  );
  const expiringByEntityName = useMemo(() => {
    const byName: Record<string, number> = {};
    for (const w of expiryWarnings) byName[w.entityName] = (byName[w.entityName] ?? 0) + 1;
    return byName;
  }, [expiryWarnings]);
  const hasExpired = expiryWarnings.some((w) => w.isExpired);

  return (
    <div style={{ display: 'flex', gap: '1rem', height: '100%', minHeight: 400 }}>
      {/* Left: entity list grouped by type */}
      <div style={{ width: '35%', borderRight: '1px solid var(--mantine-color-default-border)', paddingRight: '0.75rem', overflowY: 'auto' }}>
        <Stack gap="xs">
          {expiryWarnings.length > 0 && (
            <Alert color={hasExpired ? 'red' : 'yellow'} variant="light" p="xs">
              <Stack gap={2}>
                <Text size="xs" fw={600}>
                  {hasExpired ? 'Expired credentials' : 'Expiring soon'}
                </Text>
                {expiryWarnings.map((w, i) => {
                  const entity = store.entities.find((e) => e.name === w.entityName);
                  const label = `${w.entityName} — ${w.fieldKey}: ${
                    w.isExpired
                      ? `expired ${Math.abs(w.daysUntilExpiry)} days ago`
                      : `expires in ${w.daysUntilExpiry} days`
                  }`;
                  return entity ? (
                    <Text
                      key={i}
                      size="xs"
                      style={{ cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => setSelectedId(entity.id)}
                    >
                      {label}
                    </Text>
                  ) : (
                    <Text key={i} size="xs">
                      {label}
                    </Text>
                  );
                })}
              </Stack>
            </Alert>
          )}

          {/* Create new entity */}
          <Group gap={4}>
            <Select
              size="xs"
              data={typeSelectData}
              value={newType}
              onChange={(v) => v && setNewType(v as EntityType)}
              styles={{ input: { fontSize: '0.75rem' } }}
              style={{ width: 100 }}
            />
            <TextInput
              size="xs"
              placeholder="Name..."
              value={newName}
              onChange={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              style={{ flex: 1 }}
              styles={{ input: { fontSize: '0.8125rem' } }}
            />
            <ActionIcon size="sm" variant="light" onClick={handleCreate} disabled={!newName.trim()}>
              <AddIcon sx={{ fontSize: 16 }} />
            </ActionIcon>
          </Group>

          {/* Entity list grouped by type */}
          {ALL_ENTITY_TYPES.map((type) => {
            const typeEntities = store.entitiesByType[type];
            if (typeEntities.length === 0) return null;
            return (
              <Stack key={type} gap={2}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  {ENTITY_TYPE_LABELS[type]}
                </Text>
                {typeEntities.map((entity) => (
                  <Group key={entity.id} gap={0} wrap="nowrap">
                    {renamingId === entity.id ? (
                      <TextInput
                        size="xs"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.currentTarget.value)}
                        onBlur={handleRename}
                        onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                        autoFocus
                        style={{ flex: 1 }}
                        styles={{ input: { fontSize: '0.8125rem' } }}
                      />
                    ) : (
                      <NavLink
                        label={entity.name}
                        active={selectedId === entity.id}
                        onClick={() => setSelectedId(entity.id)}
                        style={{ flex: 1, borderRadius: 'var(--mantine-radius-sm)' }}
                        rightSection={
                          <Badge size="xs" variant="light">
                            {Object.keys(entity.fields).filter((k) => !k.startsWith('_')).length}
                          </Badge>
                        }
                      />
                    )}
                    <Menu position="bottom-end" withArrow>
                      <Menu.Target>
                        <ActionIcon size="xs" variant="subtle">
                          <MoreVertIcon sx={{ fontSize: 14 }} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<EditIcon sx={{ fontSize: 14 }} />}
                          onClick={() => {
                            setRenamingId(entity.id);
                            setRenameValue(entity.name);
                          }}
                        >
                          Rename
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                          onClick={() => {
                            const dup = store.duplicateEntity(entity.id, `${entity.name} (copy)`);
                            setSelectedId(dup.id);
                          }}
                        >
                          Duplicate
                        </Menu.Item>
                        {store.entities.length > 1 && (
                          <Menu.Item
                            color="red"
                            leftSection={<DeleteIcon sx={{ fontSize: 14 }} />}
                            onClick={() => {
                              store.deleteEntity(entity.id);
                              if (selectedId === entity.id) setSelectedId(null);
                            }}
                          >
                            Delete
                          </Menu.Item>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                ))}
              </Stack>
            );
          })}
        </Stack>
      </div>

      {/* Right: fields for selected entity */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!selectedEntity ? (
          <Text size="sm" c="dimmed" ta="center" mt="xl">
            Select an entity to view its fields.
          </Text>
        ) : entries.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" mt="xl">
            No fields in this entity yet. Import a document or add fields manually.
          </Text>
        ) : (
          <Stack gap="xs">
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Field</Table.Th>
                  <Table.Th>Value</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {entries.map(([key, val]) => (
                  <Table.Tr key={key}>
                    <Table.Td><Text size="xs">{key}</Text></Table.Td>
                    <Table.Td>
                      {editingKey === key ? (
                        <TextInput
                          size="xs"
                          value={editValue}
                          onChange={(e) => setEditValue(e.currentTarget.value)}
                          onBlur={() => handleSaveEdit(key)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(key)}
                          autoFocus
                          styles={{ input: { fontSize: '0.8125rem' } }}
                        />
                      ) : (
                        <Text
                          size="xs"
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setEditingKey(key);
                            setEditValue(val);
                          }}
                        >
                          {val}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={() => store.removeField(selectedEntity.id, key)}
                      >
                        <DeleteIcon sx={{ fontSize: 14 }} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Button size="xs" variant="subtle" color="red" onClick={() => store.clearFields(selectedEntity.id)}>
              Clear All Fields
            </Button>
          </Stack>
        )}

        {/* Import/Export buttons */}
        <Stack gap="xs" mt="auto" pt="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          {importMessage && (
            <Text size="xs" c={importMessage.startsWith('Error') ? 'red' : 'green'}>{importMessage}</Text>
          )}
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<FileDownloadIcon sx={{ fontSize: 14 }} />}
              onClick={() => {
                const json = exportEntitiesToJson(store.entities);
                downloadJson(json, `stirling-entities-${new Date().toISOString().split('T')[0]}.json`);
              }}
            >
              Export JSON
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<FileUploadIcon sx={{ fontSize: 14 }} />}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  file.text().then((text) => {
                    const result = importEntitiesFromJson(text, store);
                    setImportMessage(
                      result.errors.length > 0
                        ? `Imported ${result.imported}, errors: ${result.errors.join('; ')}`
                        : `Imported ${result.imported} entities.`
                    );
                  });
                };
                input.click();
              }}
            >
              Import JSON
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<FileUploadIcon sx={{ fontSize: 14 }} />}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.csv';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (!file) return;
                  file.text().then((text) => {
                    const result = importCsvToStore(text, newType, store);
                    setImportMessage(
                      result.errors.length > 0
                        ? `Imported ${result.imported}, errors: ${result.errors.join('; ')}`
                        : `Imported ${result.imported} entities as ${ENTITY_TYPE_LABELS[newType]}.`
                    );
                  });
                };
                input.click();
              }}
            >
              Import CSV
            </Button>
          </Group>
        </Stack>
      </div>
    </div>
  );
}
