import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Modal,
  Button,
  Stack,
  Group,
  TextInput,
  Textarea,
  Divider,
  ColorInput,
  NumberInput,
  Text,
  Alert,
  Switch,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { SmartFolder } from '@app/types/smartFolders';
import { AutomationConfig, AutomationMode } from '@app/types/automation';
import { IconPicker as IconSelector } from '@app/components/smartFolders/IconPicker';
import AutomationCreation from '@app/components/tools/automate/AutomationCreation';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { smartFolderStorage } from '@app/services/smartFolderStorage';

const ACCENT_SWATCHES = [
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
  const [maxRetries, setMaxRetries] = useState<number>(editFolder?.maxRetries ?? 3);
  const [retryDelayMinutes, setRetryDelayMinutes] = useState<number>(editFolder?.retryDelayMinutes ?? 5);
  const [outputMode, setOutputMode] = useState<'new_file' | 'new_version'>(editFolder?.outputMode ?? 'new_file');
  const [outputName, setOutputName] = useState(editFolder?.outputName ?? editFolder?.name ?? '');
  const [outputNamePosition, setOutputNamePosition] = useState<'prefix' | 'suffix'>(editFolder?.outputNamePosition ?? 'prefix');
  const outputNameDirty = useRef(!!editFolder?.outputName);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [automationError, setAutomationError] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // AutomationCreation exposes its save function via this ref
  const automationSaveTrigger = useRef<(() => void) | null>(null);

  const resetState = useCallback(() => {
    setName(editFolder?.name ?? '');
    setDescription(editFolder?.description ?? '');
    setIcon(editFolder?.icon ?? 'FolderIcon');
    setAccentColor(editFolder?.accentColor ?? '#3b82f6');
    setMaxRetries(editFolder?.maxRetries ?? 3);
    setRetryDelayMinutes(editFolder?.retryDelayMinutes ?? 5);
    setOutputMode(editFolder?.outputMode ?? 'new_file');
    setOutputName(editFolder?.outputName ?? editFolder?.name ?? '');
    setOutputNamePosition(editFolder?.outputNamePosition ?? 'prefix');
    outputNameDirty.current = !!editFolder?.outputName;

    setNameError('');
    setAutomationError('');
    setSaveError(null);
    setSaving(false);
  }, [editFolder]);

  useEffect(() => {
    if (opened) resetState();
  }, [opened, resetState]);

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Called by AutomationCreation once it has persisted the automation
  const handleAutomationComplete = useCallback(async (automation: AutomationConfig) => {
    const trimmedName = name.trim();
    try {
      const retryFields = {
        maxRetries,
        retryDelayMinutes,
      };
      if (isEditMode && editFolder) {
        await smartFolderStorage.updateFolder({
          ...editFolder,
          name: trimmedName,
          description: description.trim(),
          icon,
          accentColor,
          automationId: automation.id,
          ...retryFields,
          outputMode: outputMode === 'new_version' ? 'new_version' : undefined,
          outputName: outputName.trim() || undefined,
          outputNamePosition: outputNamePosition === 'suffix' ? 'suffix' : undefined,
        });
      } else {
        await smartFolderStorage.createFolder({
          name: trimmedName,
          description: description.trim(),
          icon,
          accentColor,
          automationId: automation.id,
          ...retryFields,
          outputMode: outputMode === 'new_version' ? 'new_version' : undefined,
          outputName: outputName.trim() || undefined,
          outputNamePosition: outputNamePosition === 'suffix' ? 'suffix' : undefined,
        });
      }
      resetState();
      onSaved();
      onClose();
    } catch (error) {
      console.error('Failed to save smart folder:', error);
      setSaveError(t('smartFolders.modal.saveFailed', 'Failed to save folder. Please try again.'));
    } finally {
      setSaving(false);
    }
  }, [name, description, icon, accentColor, outputMode, outputName, outputNamePosition, isEditMode, editFolder, resetState, onSaved, onClose]);

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
    setAutomationError('');
    setSaving(true);
    // Trigger automation save; onComplete handles the rest
    automationSaveTrigger.current?.();
  };

  const title = isEditMode
    ? t('smartFolders.modal.editTitle', 'Edit Watch Folder')
    : t('smartFolders.modal.createTitle', 'New Watch Folder');

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
              placeholder={t('smartFolders.modal.namePlaceholder', 'My Watch Folder')}
              value={name}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setName(val);
                setNameError('');
                if (!outputNameDirty.current) setOutputName(val);
              }}
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

          <ColorInput
            label={t('smartFolders.modal.color', 'Accent color')}
            value={accentColor}
            onChange={setAccentColor}
            format="hex"
            swatches={ACCENT_SWATCHES}
            size="sm"
            popoverProps={{ withinPortal: true }}
          />
        </Stack>

        <Divider label={t('smartFolders.modal.outputLabel', 'Output')} labelPosition="left" />

        <Stack gap="xs">
          <Switch
            label={t('smartFolders.modal.outputModeVersion', 'Replace original?')}
            description={outputMode === 'new_version'
              ? t('smartFolders.modal.outputModeVersionDesc', 'Output becomes a new version of the input file rather than a separate file')
              : t('smartFolders.modal.outputModeNewDesc', 'Output is saved as a new separate file')}
            checked={outputMode === 'new_version'}
            onChange={(e) => setOutputMode(e.currentTarget.checked ? 'new_version' : 'new_file')}
            size="sm"
          />
          {outputMode !== 'new_version' && (
            <Group gap="xs" align="flex-end">
              <TextInput
                label={t('smartFolders.modal.outputName', outputNamePosition === 'suffix' ? 'Output filename suffix' : 'Output filename prefix')}
                value={outputName}
                onChange={(e) => { outputNameDirty.current = true; setOutputName(e.currentTarget.value); }}
                maxLength={100}
                size="sm"
                style={{ flex: 1 }}
              />
              <Switch
                label={t('smartFolders.modal.outputNameSuffix', 'Suffix')}
                checked={outputNamePosition === 'suffix'}
                onChange={(e) => setOutputNamePosition(e.currentTarget.checked ? 'suffix' : 'prefix')}
                size="sm"
                mb={4}
              />
            </Group>
          )}
        </Stack>

        <Divider label={t('smartFolders.modal.retryLabel', 'Auto-retry')} labelPosition="left" />

        <Group gap="md" align="flex-end">
          <NumberInput
            label={t('smartFolders.modal.maxRetries', 'Max retries')}
            description={t('smartFolders.modal.maxRetriesDesc', '0 to disable')}
            value={maxRetries}
            onChange={(v) => setMaxRetries(typeof v === 'number' ? Math.max(0, Math.min(10, v)) : 0)}
            min={0}
            max={10}
            size="sm"
            style={{ flex: 1 }}
          />
          <NumberInput
            label={t('smartFolders.modal.retryDelay', 'Delay (minutes)')}
            value={retryDelayMinutes}
            onChange={(v) => setRetryDelayMinutes(typeof v === 'number' ? Math.max(1, Math.min(60, v)) : 5)}
            min={1}
            max={60}
            size="sm"
            disabled={maxRetries === 0}
            style={{ flex: 1 }}
          />
        </Group>

        <Divider label={t('smartFolders.modal.automation', 'Automation')} labelPosition="left" />

        <AutomationCreation
          mode={isEditMode ? AutomationMode.EDIT : AutomationMode.CREATE}
          existingAutomation={existingAutomation ?? undefined}
          onBack={handleClose}
          onComplete={handleAutomationComplete}
          onSaveFailed={() => { setSaving(false); setAutomationError(t('smartFolders.modal.automationRequired', 'Add at least one configured step before saving.')); }}
          toolRegistry={toolRegistry}
          hideMetadata
          nameOverride={name.trim() || t('smartFolders.modal.automationNameFallback', 'Watch Folder Automation')}
          saveTriggerRef={automationSaveTrigger}
        />
        {automationError && (
          <Text size="xs" c="red">{automationError}</Text>
        )}

        <Divider />

        {saveError && (
          <Alert color="red" variant="light" onClose={() => setSaveError(null)} withCloseButton>
            {saveError}
          </Alert>
        )}

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
