import { Stack, Text, Group, Select, SegmentedControl, NumberInput, Button, ActionIcon, Divider } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { type OverlayPdfsParameters, type OverlayMode } from '@app/hooks/tools/overlayPdfs/useOverlayPdfsParameters';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import styles from '@app/components/tools/overlayPdfs/OverlayPdfsSettings.module.css';
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface OverlayPdfsSettingsProps {
  parameters: OverlayPdfsParameters;
  onParameterChange: <K extends keyof OverlayPdfsParameters>(key: K, value: OverlayPdfsParameters[K]) => void;
  disabled?: boolean;
}

export default function OverlayPdfsSettings({ parameters, onParameterChange, disabled = false }: OverlayPdfsSettingsProps) {
  const { t } = useTranslation();
  const { openFilesModal } = useFilesModalContext();

  const handleOverlayFilesChange = (files: File[]) => {
    onParameterChange('overlayFiles', files);
    // Reset counts to match number of files if in FixedRepeatOverlay
    if (parameters.overlayMode === 'FixedRepeatOverlay') {
      const nextCounts = files.map((_, i) => parameters.counts[i] && parameters.counts[i] > 0 ? parameters.counts[i] : 1);
      onParameterChange('counts', nextCounts);
    }
  };

  const handleModeChange = (mode: OverlayMode) => {
    onParameterChange('overlayMode', mode);
    if (mode !== 'FixedRepeatOverlay') {
      onParameterChange('counts', []);
    } else if (parameters.overlayFiles?.length > 0) {
      onParameterChange('counts', parameters.overlayFiles.map((_, i) => parameters.counts[i] && parameters.counts[i] > 0 ? parameters.counts[i] : 1));
    }
  };

  const handleOpenOverlayFilesModal = () => {
    if (disabled) return;
    openFilesModal({
      customHandler: (files: File[]) => {
        handleOverlayFilesChange([...(parameters.overlayFiles || []), ...files]);
      }
    });
  };

  return (
    <Stack gap="md">

      <Stack gap="xs">
        <Text size="sm" fw={500}>{t('overlay-pdfs.mode.label', 'Overlay Mode')}</Text>
        <Select
          data={[
            { value: 'SequentialOverlay', label: t('overlay-pdfs.mode.sequential', 'Sequential Overlay') },
            { value: 'InterleavedOverlay', label: t('overlay-pdfs.mode.interleaved', 'Interleaved Overlay') },
            { value: 'FixedRepeatOverlay', label: t('overlay-pdfs.mode.fixedRepeat', 'Fixed Repeat Overlay') },
          ]}
          value={parameters.overlayMode}
          onChange={(v) => handleModeChange((v || 'SequentialOverlay') as OverlayMode)}
          disabled={disabled}
          comboboxProps={{ withinPortal: true, zIndex: Z_INDEX_AUTOMATE_DROPDOWN }}
        />
      </Stack>

      <Divider />

      <Stack gap="xs">
        <Text size="sm" fw={500}>{t('overlay-pdfs.position.label', 'Overlay Position')}</Text>
        <SegmentedControl
          value={String(parameters.overlayPosition)}
          onChange={(v) => onParameterChange('overlayPosition', (v === '1' ? 1 : 0) as 0 | 1)}
          data={[
            { label: t('overlay-pdfs.position.foreground', 'Foreground'), value: '0' },
            { label: t('overlay-pdfs.position.background', 'Background'), value: '1' },
          ]}
          disabled={disabled}
        />
      </Stack>

      {parameters.overlayMode === 'FixedRepeatOverlay' && (
        <>
          <Divider />
          <Stack gap="xs">
            <Text size="sm" fw={500}>{t('overlay-pdfs.counts.label', 'Overlay Counts')}</Text>
            {parameters.overlayFiles?.length > 0 ? (
              <Stack gap="xs">
                {parameters.overlayFiles.map((_, index) => (
                  <Group key={index} gap="xs" wrap="nowrap">
                    <Text size="sm" className={styles.countLabel}>
                      {t('overlay-pdfs.counts.item', 'Count for file')} {index + 1}
                    </Text>
                    <NumberInput
                      min={1}
                      step={1}
                      value={parameters.counts[index] ?? 1}
                      onChange={(value) => {
                        const next = [...(parameters.counts || [])];
                        next[index] = Number(value) || 1;
                        onParameterChange('counts', next);
                      }}
                      disabled={disabled}
                    />
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                {t('overlay-pdfs.counts.noFiles', 'Add overlay files to configure counts')}
              </Text>
            )}
          </Stack>
        </>
      )}

      <Divider />

      <Stack gap="xs">
        <Text size="sm" fw={500}>{t('overlay-pdfs.overlayFiles.label', 'Overlay Files')}</Text>
        <Button
          size="xs"
          color="blue"
          onClick={handleOpenOverlayFilesModal}
          disabled={disabled}
          leftSection={<LocalIcon icon="add" width="14" height="14" />}
          fullWidth
        >
          {parameters.overlayFiles?.length > 0
            ? t('overlay-pdfs.overlayFiles.addMore', 'Add more PDFs...')
            : t('overlay-pdfs.overlayFiles.placeholder', 'Choose PDF(s)...')}
        </Button>

        {parameters.overlayFiles?.length > 0 && (() => {
          return (
            <div className={styles.fileListContainer}>
              <Stack gap="xs">
                {parameters.overlayFiles.map((file, index) => (
                  <Group
                    key={index}
                    justify="space-between"
                    p="xs"
                    className={styles.fileItem}
                  >
                    <Group gap="xs" className={styles.fileGroup}>
                      <div className={styles.fileNameContainer}>
                        <div
                          className={styles.fileName}
                          title={file.name}
                        >
                          {file.name}
                        </div>
                      </div>
                      <Text size="xs" c="dimmed" className={styles.fileSize}>
                        ({(file.size / 1024).toFixed(1)} KB)
                      </Text>
                    </Group>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      className={styles.removeButton}
                      onClick={() => {
                        const next = (parameters.overlayFiles || []).filter((_, i) => i !== index);
                        handleOverlayFilesChange(next);
                      }}
                      disabled={disabled}
                    >
                      <LocalIcon icon="close-rounded" width="14" height="14" />
                    </ActionIcon>
                  </Group>
                ))}
              </Stack>
            </div>
          );
        })()}
      </Stack>

    </Stack>
  );
}
