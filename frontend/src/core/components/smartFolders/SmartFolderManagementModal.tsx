import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Button,
  Stack,
  Group,
  TextInput,
  ColorInput,
  NumberInput,
  Text,
  Alert,
  Switch,
  Select,
  Box,
  Collapse,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { SmartFolder } from '@app/types/smartFolders';
import { AutomationConfig, AutomationMode } from '@app/types/automation';
import { IconPicker as IconSelector } from '@app/components/smartFolders/IconPicker';
import AutomationCreation from '@app/components/tools/automate/AutomationCreation';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { smartFolderStorage } from '@app/services/smartFolderStorage';
import { folderDirectoryHandleStorage } from '@app/services/folderDirectoryHandleStorage';
import {
  createServerFolder,
  updateServerFolder,
  deleteServerFolder,
} from '@app/services/serverFolderApiService';
import { buildPipelineJson } from '@app/utils/automationExecutor';
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial';

const ACCENT_SWATCHES = [
  '#3b82f6', '#0ea5e9', '#14b8a6', '#22c55e',
  '#f97316', '#ef4444', '#9333ea', '#ec4899',
  '#6366f1', '#eab308', '#64748b', '#0f172a',
];

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      size="xs"
      fw={600}
      tt="uppercase"
      style={{ letterSpacing: '0.06em', color: 'var(--tool-subcategory-text-color)', marginBottom: '0.5rem' }}
    >
      {children}
    </Text>
  );
}

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

  // Animation state
  const [isMounted, setIsMounted] = useState(false);
  const [isIn, setIsIn] = useState(false);

  useEffect(() => {
    if (opened) {
      setIsMounted(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => setIsIn(true)));
      return () => cancelAnimationFrame(raf);
    } else {
      setIsIn(false);
      const timer = setTimeout(() => setIsMounted(false), 240);
      return () => clearTimeout(timer);
    }
  }, [opened]);

  // Close on Escape
  useEffect(() => {
    if (!opened) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const [name, setName] = useState(editFolder?.name ?? '');
  const [icon, setIcon] = useState(editFolder?.icon ?? 'FolderIcon');
  const [accentColor, setAccentColor] = useState(editFolder?.accentColor ?? '#3b82f6');
  const [maxRetries, setMaxRetries] = useState<number>(editFolder?.maxRetries ?? 3);
  const [retryDelayMinutes, setRetryDelayMinutes] = useState<number>(editFolder?.retryDelayMinutes ?? 5);
  const [outputMode, setOutputMode] = useState<'new_file' | 'new_version'>(editFolder?.outputMode ?? 'new_file');
  const [outputName, setOutputName] = useState(editFolder?.outputName ?? editFolder?.name ?? '');
  const [outputNamePosition, setOutputNamePosition] = useState<'prefix' | 'suffix' | 'auto-number'>(editFolder?.outputNamePosition ?? 'prefix');
  const [inputSource, setInputSource] = useState<NonNullable<SmartFolder['inputSource']>>(editFolder?.inputSource ?? 'idb');
  const [outputTtlHours, setOutputTtlHours] = useState<string>(
    editFolder?.outputTtlHours != null ? String(editFolder.outputTtlHours) : 'forever'
  );
  const [deleteOutputOnDownload, setDeleteOutputOnDownload] = useState(editFolder?.deleteOutputOnDownload ?? false);
  const outputNameDirty = useRef(!!editFolder?.outputName);
  const [saving, setSaving] = useState(false);
  const [outputDirName, setOutputDirName] = useState<string | null>(editFolder?.hasOutputDirectory ? '(loading…)' : null);
  const pendingDirHandle = useRef<FileSystemDirectoryHandle | null>(null);
  const [nameError, setNameError] = useState('');
  const [automationError, setAutomationError] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(isEditMode);

  const automationSaveTrigger = useRef<(() => void) | null>(null);

  const resetState = useCallback(() => {
    setName(editFolder?.name ?? '');
    setIcon(editFolder?.icon ?? 'FolderIcon');
    setAccentColor(editFolder?.accentColor ?? '#3b82f6');
    setMaxRetries(editFolder?.maxRetries ?? 3);
    setRetryDelayMinutes(editFolder?.retryDelayMinutes ?? 5);
    setOutputMode(editFolder?.outputMode ?? 'new_file');
    setOutputName(editFolder?.outputName ?? editFolder?.name ?? '');
    setOutputNamePosition((editFolder?.outputNamePosition as 'prefix' | 'suffix' | 'auto-number') ?? 'prefix');
    setInputSource(editFolder?.inputSource ?? 'idb');
    setOutputTtlHours(editFolder?.outputTtlHours != null ? String(editFolder.outputTtlHours) : 'forever');
    setDeleteOutputOnDownload(editFolder?.deleteOutputOnDownload ?? false);
    outputNameDirty.current = !!editFolder?.outputName;
    setShowAdvanced(!!editFolder);
    setNameError('');
    setAutomationError('');
    setSaveError(null);
    setSaving(false);
  }, [editFolder]);

  useEffect(() => {
    if (opened) {
      resetState();
      pendingDirHandle.current = null;
      if (editFolder?.hasOutputDirectory && editFolder.id) {
        folderDirectoryHandleStorage.get(editFolder.id).then(h => setOutputDirName(h?.name ?? null));
      } else {
        setOutputDirName(null);
      }
    }
  }, [opened, resetState, editFolder]);

  const handleClose = () => { resetState(); onClose(); };

  const handleAutomationComplete = useCallback(async (automation: AutomationConfig) => {
    const trimmedName = name.trim();
    const isServerFolder = inputSource === 'server-folder';

    let configJson: string | null = null;
    if (isServerFolder) {
      configJson = buildPipelineJson(automation, toolRegistry);
      if (!configJson) {
        setSaveError('This automation contains browser-only steps and cannot run as a server watch folder. Remove those steps or choose a different input source.');
        setSaving(false);
        return;
      }
    }

    try {
      const retryFields = { maxRetries, retryDelayMinutes };
      const hasOutputDirectory = outputDirName !== null;
      const ttlHoursNum = isServerFolder && outputTtlHours !== 'forever' ? Number(outputTtlHours) : null;
      const folderData = {
        name: trimmedName,
        description: '',
        icon,
        accentColor,
        automationId: automation.id,
        ...retryFields,
        outputMode: outputMode === 'new_version' ? 'new_version' as const : undefined,
        outputName: outputName.trim() || undefined,
        outputNamePosition: outputNamePosition !== 'prefix' ? outputNamePosition : undefined,
        hasOutputDirectory,
        inputSource: inputSource !== 'idb' ? inputSource : undefined,
        processingMode: isServerFolder ? 'server' as const : undefined,
        outputTtlHours: isServerFolder ? ttlHoursNum : undefined,
        deleteOutputOnDownload: isServerFolder ? deleteOutputOnDownload : undefined,
      };

      if (isEditMode && editFolder) {
        const wasServerFolder = editFolder.inputSource === 'server-folder';
        await smartFolderStorage.updateFolder({ ...editFolder, ...folderData });
        if (pendingDirHandle.current) {
          await folderDirectoryHandleStorage.set(editFolder.id, pendingDirHandle.current);
        } else if (!hasOutputDirectory) {
          await folderDirectoryHandleStorage.remove(editFolder.id);
        }
        if (isServerFolder && configJson) {
          if (wasServerFolder) {
            await updateServerFolder(editFolder.id, trimmedName, configJson, ttlHoursNum, deleteOutputOnDownload);
          } else {
            await createServerFolder(editFolder.id, trimmedName, configJson, ttlHoursNum, deleteOutputOnDownload);
          }
        } else if (wasServerFolder && !isServerFolder) {
          await deleteServerFolder(editFolder.id).catch(() => {});
        }
      } else {
        const newFolder = await smartFolderStorage.createFolder(folderData);
        if (pendingDirHandle.current) {
          await folderDirectoryHandleStorage.set(newFolder.id, pendingDirHandle.current);
        }
        if (isServerFolder && configJson) {
          await createServerFolder(newFolder.id, trimmedName, configJson, ttlHoursNum, deleteOutputOnDownload);
        }
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
  }, [name, icon, accentColor, outputMode, outputName, outputNamePosition, outputDirName, maxRetries, retryDelayMinutes, inputSource, outputTtlHours, deleteOutputOnDownload, isEditMode, editFolder, toolRegistry, resetState, onSaved, onClose, t]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setNameError(t('smartFolders.modal.nameRequired', 'Folder name is required')); return; }
    if (trimmedName.length > 50) { setNameError(t('smartFolders.modal.nameTooLong', 'Folder name must be 50 characters or less')); return; }
    setAutomationError('');
    setSaving(true);
    automationSaveTrigger.current?.();
  };

  const title = isEditMode
    ? t('smartFolders.modal.editTitle', 'Edit Watch Folder')
    : t('smartFolders.modal.createTitle', 'New Watch Folder');

  if (!isMounted) return null;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.55)',
          opacity: isIn ? 1 : 0,
          transition: 'opacity 220ms ease',
        }}
      />

      {/* Modal panel */}
      <div
        style={{
          position: 'relative',
          width: 'min(80rem, 95vw)',
          height: 'min(88vh, 800px)',
          backgroundColor: 'var(--bg-toolbar)',
          borderRadius: 'var(--mantine-radius-md)',
          border: '0.0625rem solid var(--border-subtle)',
          boxShadow: '0 1.5rem 3rem rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          opacity: isIn ? 1 : 0,
          transform: isIn ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(0.75rem)',
          transition: `opacity 240ms ${EASING}, transform 240ms ${EASING}`,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1rem 1.5rem 0.875rem',
          borderBottom: '0.0625rem solid var(--border-subtle)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Text fw={600} size="sm">{title}</Text>
          <button
            onClick={handleClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.25rem', borderRadius: 'var(--mantine-radius-sm)',
              color: 'var(--mantine-color-dimmed)', fontSize: '1.25rem',
              lineHeight: 1, display: 'flex', alignItems: 'center',
              justifyContent: 'center', width: '2rem', height: '2rem',
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body: two-column layout */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

          {/* ── Left panel: folder config ── */}
          <div style={{
            width: '28rem',
            flexShrink: 0,
            borderRight: '0.0625rem solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
              <Stack gap="lg">

                {/* ── Identity ── */}
                <div>
                  <SectionLabel>Folder</SectionLabel>
                  <Stack gap="xs">
                    <Group gap="xs" align="flex-end">
                      <TextInput
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

                    <ColorInput
                      label={t('smartFolders.modal.color', 'Accent colour')}
                      value={accentColor}
                      onChange={setAccentColor}
                      format="hex"
                      swatches={ACCENT_SWATCHES}
                      size="sm"
                      popoverProps={{ withinPortal: true, zIndex: 400 }}
                    />
                  </Stack>
                </div>

                {/* ── Source & Output ── */}
                <div>
                  <SectionLabel>Source &amp; Output</SectionLabel>
                  <Stack gap="sm">
                    <Select
                      label="Input source"
                      value={inputSource}
                      onChange={(v) => v && setInputSource(v as NonNullable<SmartFolder['inputSource']>)}
                      data={[
                        { value: 'idb', label: 'Browser — drop files here' },
                        { value: 'server-folder', label: 'Server watch folder' },
                      ]}
                      size="sm"
                      comboboxProps={{ withinPortal: true, zIndex: 400 }}
                    />

                    {/* Server-specific options, visually indented under the select */}
                    {inputSource === 'server-folder' && (
                      <Box style={{
                        marginLeft: '0.75rem',
                        paddingLeft: '0.75rem',
                        borderLeft: '2px solid var(--border-subtle)',
                      }}>
                        <Stack gap="sm">
                          <Select
                            label="Keep processed files on server"
                            value={outputTtlHours}
                            onChange={(v) => v && setOutputTtlHours(v)}
                            data={[
                              { value: '1', label: '1 hour' },
                              { value: '6', label: '6 hours' },
                              { value: '24', label: '24 hours' },
                              { value: '168', label: '7 days' },
                              { value: '720', label: '30 days' },
                              { value: 'forever', label: 'Forever' },
                            ]}
                            size="sm"
                            comboboxProps={{ withinPortal: true, zIndex: 400 }}
                          />
                          <Switch
                            label="Delete from server after download"
                            description="Output file is removed from the server after downloading"
                            checked={deleteOutputOnDownload}
                            onChange={(e) => setDeleteOutputOnDownload(e.currentTarget.checked)}
                            size="sm"
                          />
                        </Stack>
                      </Box>
                    )}

                    {/* Local output folder */}
                    <Box
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: 'var(--mantine-radius-sm)',
                        border: `0.0625rem solid ${outputDirName ? 'rgba(34,197,94,0.4)' : 'var(--border-subtle)'}`,
                        backgroundColor: outputDirName ? 'rgba(34,197,94,0.06)' : 'transparent',
                      }}
                    >
                      <Group gap="xs" align="center" wrap="nowrap">
                        <FolderSpecialIcon style={{
                          fontSize: '1rem',
                          color: outputDirName ? '#22c55e' : 'var(--mantine-color-dimmed)',
                          flexShrink: 0,
                        }} />
                        <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
                          <Text size="xs" fw={500}>Local output folder</Text>
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {outputDirName ?? 'Not set — outputs stay in app'}
                          </Text>
                        </Stack>
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={async () => {
                            try {
                              const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
                              pendingDirHandle.current = handle;
                              setOutputDirName(handle.name);
                            } catch { /* cancelled */ }
                          }}
                        >
                          {outputDirName ? 'Change' : 'Choose'}
                        </Button>
                        {outputDirName && (
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            onClick={() => { pendingDirHandle.current = null; setOutputDirName(null); }}
                          >
                            Clear
                          </Button>
                        )}
                      </Group>
                    </Box>
                  </Stack>
                </div>

                {/* ── Advanced (collapsible) ── */}
                <div>
                  <button
                    onClick={() => setShowAdvanced(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0.25rem 0', width: '100%',
                      color: 'var(--tool-subcategory-text-color)',
                      fontSize: '0.7rem', fontWeight: 600,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}
                  >
                    <span style={{
                      display: 'inline-block', fontSize: '0.55rem',
                      transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 160ms ease',
                    }}>
                      ▶
                    </span>
                    Advanced
                  </button>

                  <Collapse in={showAdvanced} transitionDuration={180}>
                    <Stack gap="sm" mt="sm">

                      {/* Replace original — only meaningful for browser mode */}
                      {inputSource !== 'server-folder' && (
                        <Switch
                          label="Replace original file"
                          description={outputMode === 'new_version'
                            ? 'Output replaces input as a new version'
                            : 'Output saved as a separate new file'}
                          checked={outputMode === 'new_version'}
                          onChange={(e) => setOutputMode(e.currentTarget.checked ? 'new_version' : 'new_file')}
                          size="sm"
                        />
                      )}

                      {/* Filename prefix / suffix */}
                      <Box style={{
                        opacity: outputMode === 'new_version' ? 0.4 : 1,
                        pointerEvents: outputMode === 'new_version' ? 'none' : 'auto',
                      }}>
                        <Group gap="xs" align="flex-end">
                          {outputNamePosition === 'auto-number' ? (
                            <Box style={{ flex: 1 }}>
                              <Text size="xs" fw={500} mb={4}>Auto-number</Text>
                              <Text size="xs" c="dimmed">e.g. document.pdf → document (1).pdf</Text>
                            </Box>
                          ) : (
                            <TextInput
                              label={outputNamePosition === 'suffix' ? 'Filename suffix' : 'Filename prefix'}
                              value={outputName}
                              onChange={(e) => { outputNameDirty.current = true; setOutputName(e.currentTarget.value); }}
                              maxLength={100}
                              size="sm"
                              style={{ flex: 1 }}
                            />
                          )}
                          <Select
                            size="xs"
                            value={outputNamePosition}
                            onChange={(v) => v && setOutputNamePosition(v as 'prefix' | 'suffix' | 'auto-number')}
                            data={[
                              { value: 'prefix', label: 'Prefix' },
                              { value: 'suffix', label: 'Suffix' },
                              { value: 'auto-number', label: 'Auto-number' },
                            ]}
                            style={{ width: '8rem', flexShrink: 0 }}
                            mb={4}
                            comboboxProps={{ withinPortal: true, zIndex: 400 }}
                          />
                        </Group>
                      </Box>

                      {/* Retry settings */}
                      <Group gap="sm" grow>
                        <NumberInput
                          label="Max auto retries"
                          value={maxRetries}
                          onChange={(v) => setMaxRetries(typeof v === 'number' ? Math.max(0, Math.min(10, v)) : 0)}
                          min={0}
                          max={10}
                          size="sm"
                        />
                        <NumberInput
                          label="Retry interval (min)"
                          value={retryDelayMinutes}
                          onChange={(v) => setRetryDelayMinutes(typeof v === 'number' ? Math.max(1, Math.min(60, v)) : 5)}
                          min={1}
                          max={60}
                          size="sm"
                          disabled={maxRetries === 0}
                        />
                      </Group>

                    </Stack>
                  </Collapse>
                </div>

              </Stack>
            </div>

            {/* Footer actions */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '0.0625rem solid var(--border-subtle)', flexShrink: 0 }}>
              {saveError && (
                <Alert color="red" variant="light" onClose={() => setSaveError(null)} withCloseButton mb="sm">
                  {saveError}
                </Alert>
              )}
              <Group justify="flex-end" gap="sm">
                <Button variant="subtle" size="sm" color="gray" onClick={handleClose}>
                  {t('cancel', 'Cancel')}
                </Button>
                <Button size="sm" onClick={handleSave} loading={saving} disabled={!name.trim()}>
                  {isEditMode
                    ? t('smartFolders.modal.saveChanges', 'Save changes')
                    : t('smartFolders.modal.createFolder', 'Create folder')}
                </Button>
              </Group>
            </div>
          </div>

          {/* ── Right panel: automation steps ── */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.5rem 0.5rem', flexShrink: 0 }}>
              <SectionLabel>Steps</SectionLabel>
              {automationError && <Text size="xs" c="red" mt={4}>{automationError}</Text>}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 1.5rem 1.5rem' }}>
              <AutomationCreation
                mode={isEditMode ? AutomationMode.EDIT : AutomationMode.CREATE}
                existingAutomation={existingAutomation ?? undefined}
                onBack={handleClose}
                onComplete={handleAutomationComplete}
                onSaveFailed={() => {
                  setSaving(false);
                  setAutomationError(t('smartFolders.modal.automationRequired', 'Add at least one configured step before saving.'));
                }}
                toolRegistry={toolRegistry}
                hideMetadata
                nameOverride={name.trim() || t('smartFolders.modal.automationNameFallback', 'Watch Folder Automation')}
                saveTriggerRef={automationSaveTrigger}
              />
            </div>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
}
