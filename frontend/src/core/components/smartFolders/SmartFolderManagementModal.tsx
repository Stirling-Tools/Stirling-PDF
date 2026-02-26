import { useState, useCallback, useRef } from 'react';
import {
  Modal,
  Button,
  Stack,
  Group,
  TextInput,
  Textarea,
  Divider,
  ColorSwatch,
  SimpleGrid,
  Text,
  Box,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { SmartFolder } from '@app/types/smartFolders';
import { AutomationConfig, AutomationMode } from '@app/types/automation';
import IconSelector from '@app/components/tools/automate/IconSelector';
import AutomationCreation from '@app/components/tools/automate/AutomationCreation';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { smartFolderStorage } from '@app/services/smartFolderStorage';

const ACCENT_COLORS = [
  '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e',
  '#f97316', '#ef4444', '#9333ea', '#ec4899',
  '#6366f1', '#eab308', '#64748b', '#0f172a',
];

interface SmartFolderManagementModalProps {
  opened: boolean;
  editFolder?: SmartFolder | null;
  existingAutomation?: AutomationConfig | null;
  onClose: () => void;
  onSaved: () => void;
}

export function SmartFolderManagementModal({
  opened,
  editFolder,
  existingAutomation,
  onClose,
  onSaved,
}: SmartFolderManagementModalProps) {
  const { t } = useTranslation();
  const { toolRegistry } = useToolWorkflow();
  const isEditMode = !!editFolder;

  const [name, setName] = useState(editFolder?.name ?? '');
  const [description, setDescription] = useState(editFolder?.description ?? '');
  const [icon, setIcon] = useState(editFolder?.icon ?? 'FolderIcon');
  const [accentColor, setAccentColor] = useState(editFolder?.accentColor ?? '#3b82f6');
  const [customColor, setCustomColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  // AutomationCreation exposes its save function via this ref
  const automationSaveTrigger = useRef<(() => void) | null>(null);

  const resetState = useCallback(() => {
    setName(editFolder?.name ?? '');
    setDescription(editFolder?.description ?? '');
    setIcon(editFolder?.icon ?? 'FolderIcon');
    setAccentColor(editFolder?.accentColor ?? '#3b82f6');
    setCustomColor('');
    setNameError('');
    setSaving(false);
  }, [editFolder]);

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Called by AutomationCreation once it has persisted the automation
  const handleAutomationComplete = useCallback(async (automation: AutomationConfig) => {
    const trimmedName = name.trim();
    try {
      if (isEditMode && editFolder) {
        await smartFolderStorage.updateFolder({
          ...editFolder,
          name: trimmedName,
          description: description.trim(),
          icon,
          accentColor,
          automationId: automation.id,
        });
      } else {
        await smartFolderStorage.createFolder({
          name: trimmedName,
          description: description.trim(),
          icon,
          accentColor,
          automationId: automation.id,
        });
      }
      resetState();
      onSaved();
      onClose();
    } catch (error) {
      console.error('Failed to save smart folder:', error);
    } finally {
      setSaving(false);
    }
  }, [name, description, icon, accentColor, isEditMode, editFolder, resetState, onSaved, onClose]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(t('smartFolders.modal.nameRequired', 'Folder name is required'));
      return;
    }
    if (trimmedName.length > 50) {
      setNameError(t('smartFolders.modal.nameTooLong', 'Folder name must be 50 characters or less'));
      return;
    }
    setSaving(true);
    // Trigger automation save; onComplete handles the rest
    automationSaveTrigger.current?.();
  };

  const title = isEditMode
    ? t('smartFolders.modal.editTitle', 'Edit Smart Folder')
    : t('smartFolders.modal.createTitle', 'New Smart Folder');

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={title}
      size="lg"
      centered
    >
      <Stack gap="md">
        {/* Folder metadata */}
        <Stack gap="sm">
          <Group gap="xs" align="flex-end">
            <TextInput
              label={t('smartFolders.modal.name', 'Folder name')}
              placeholder={t('smartFolders.modal.namePlaceholder', 'My Smart Folder')}
              value={name}
              onChange={(e) => { setName(e.currentTarget.value); setNameError(''); }}
              error={nameError}
              withAsterisk
              maxLength={50}
              style={{ flex: 1 }}
              size="sm"
            />
            <IconSelector value={icon} onChange={setIcon} size="sm" />
          </Group>

          <Textarea
            label={t('smartFolders.modal.description', 'Description')}
            placeholder={t('smartFolders.modal.descriptionPlaceholder', 'What does this folder do?')}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            maxLength={200}
            rows={2}
            size="sm"
          />

          <Stack gap="xs">
            <Text size="sm" fw={600}>{t('smartFolders.modal.color', 'Accent color')}</Text>
            <Group gap="xs">
              <SimpleGrid cols={12} spacing={4}>
                {ACCENT_COLORS.map((color) => (
                  <ColorSwatch
                    key={color}
                    color={color}
                    size={20}
                    style={{ cursor: 'pointer', outline: accentColor === color ? `2px solid ${color}` : 'none', outlineOffset: 2 }}
                    onClick={() => setAccentColor(color)}
                  />
                ))}
              </SimpleGrid>
              <TextInput
                placeholder="#hex"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.currentTarget.value);
                  if (/^#[0-9a-fA-F]{6}$/.test(e.currentTarget.value)) {
                    setAccentColor(e.currentTarget.value);
                  }
                }}
                size="xs"
                style={{ width: '5.5rem' }}
              />
            </Group>
          </Stack>
        </Stack>

        <Divider label={t('smartFolders.modal.automation', 'Automation')} labelPosition="left" />

        <AutomationCreation
          mode={isEditMode ? AutomationMode.EDIT : AutomationMode.CREATE}
          existingAutomation={existingAutomation ?? undefined}
          onBack={handleClose}
          onComplete={handleAutomationComplete}
          toolRegistry={toolRegistry}
          hideMetadata
          nameOverride={name.trim() || 'Smart Folder Automation'}
          saveTriggerRef={automationSaveTrigger}
        />

        <Divider />

        <Group justify="flex-end" gap="sm">
          <Button variant="outline" size="sm" onClick={handleClose}>
            {t('cancel', 'Cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={!name.trim()}
          >
            {isEditMode ? t('smartFolders.modal.saveChanges', 'Save Changes') : t('smartFolders.modal.createFolder', 'Create Folder')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
