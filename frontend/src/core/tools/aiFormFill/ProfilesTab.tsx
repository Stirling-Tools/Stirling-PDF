/**
 * Profiles tab — two-column layout: profile list (left) + entries table (right).
 */
import { useState, useCallback } from 'react';
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
} from '@mantine/core';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import type { KnowledgeStore } from './useKnowledgeStore';

export function ProfilesTab({ knowledge }: { knowledge: KnowledgeStore }) {
  const [newName, setNewName] = useState('');
  const [renamingProfile, setRenamingProfile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const entries = Object.entries(knowledge.entries).filter(([k]) => !k.startsWith('_'));

  const handleCreate = useCallback(() => {
    const name = newName.trim();
    if (name && !knowledge.profileNames.includes(name)) {
      knowledge.createProfile(name);
      setNewName('');
    }
  }, [newName, knowledge]);

  const handleRename = useCallback(() => {
    if (renamingProfile && renameValue.trim() && renameValue.trim() !== renamingProfile) {
      knowledge.renameProfile(renamingProfile, renameValue.trim());
    }
    setRenamingProfile(null);
    setRenameValue('');
  }, [renamingProfile, renameValue, knowledge]);

  const handleSaveEdit = useCallback(
    (key: string) => {
      knowledge.set(key, editValue);
      setEditingKey(null);
      setEditValue('');
    },
    [editValue, knowledge]
  );

  return (
    <div style={{ display: 'flex', gap: '1rem', height: '100%', minHeight: 400 }}>
      {/* Left: profile list */}
      <div style={{ width: '35%', borderRight: '1px solid var(--mantine-color-default-border)', paddingRight: '0.75rem' }}>
        <Stack gap="xs">
          <Group gap={4}>
            <TextInput
              size="xs"
              placeholder="New profile..."
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

          {knowledge.profileNames.map((name) => (
            <Group key={name} gap={0} wrap="nowrap">
              {renamingProfile === name ? (
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
                  label={name}
                  active={knowledge.activeProfileName === name}
                  onClick={() => knowledge.setActiveProfile(name)}
                  style={{ flex: 1, borderRadius: 'var(--mantine-radius-sm)' }}
                  rightSection={
                    <Badge size="xs" variant="light">
                      {Object.keys(knowledge.entries).filter((k) => !k.startsWith('_')).length}
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
                      setRenamingProfile(name);
                      setRenameValue(name);
                    }}
                  >
                    Rename
                  </Menu.Item>
                  {knowledge.profileNames.length > 1 && (
                    <Menu.Item
                      color="red"
                      leftSection={<DeleteIcon sx={{ fontSize: 14 }} />}
                      onClick={() => knowledge.deleteProfile(name)}
                    >
                      Delete
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>
          ))}
        </Stack>
      </div>

      {/* Right: entries for active profile */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {entries.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" mt="xl">
            No entries in this profile yet. Upload a document in the Import tab to get started.
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
                    <Table.Td>
                      <Text size="xs">{key}</Text>
                    </Table.Td>
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
                      <ActionIcon size="xs" variant="subtle" color="red" onClick={() => knowledge.remove(key)}>
                        <DeleteIcon sx={{ fontSize: 14 }} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Button size="xs" variant="subtle" color="red" onClick={knowledge.clear}>
              Clear All
            </Button>
          </Stack>
        )}
      </div>
    </div>
  );
}
