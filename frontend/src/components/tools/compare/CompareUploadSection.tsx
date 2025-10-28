import { useMemo, useRef } from 'react';
import { Button, Stack, Text } from '@mantine/core';
import type { ForwardedRef } from 'react';
import { Dropzone } from '@mantine/dropzone';
import { formatFileSize } from '@app/utils/fileUtils';
import type { StirlingFileStub } from '@app/types/fileContext';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useTranslation } from 'react-i18next';

interface UploadColumnProps {
  role: 'base' | 'comparison';
  file: File | null;
  stub: StirlingFileStub | null;
  title: string;
  description: string;
  accentClass: string;
  disabled: boolean;
  onDrop: (files: File[]) => void;
  onSelectExisting: () => void;
  onClear: () => void;
}

interface CompareUploadSectionProps {
  heading: string;
  subheading: string;
  disabled: boolean;
  base: UploadColumnProps;
  comparison: UploadColumnProps;
}

const CompareUploadColumn = ({
  role,
  file,
  stub,
  title,
  description,
  accentClass,
  disabled,
  onDrop,
  onSelectExisting,
  onClear,
}: UploadColumnProps) => {
  const { t } = useTranslation();
  const openRef = useRef<(() => void) | null>(null);

  const fileLabel = useMemo(() => {
    const fileName = stub?.name ?? file?.name ?? null;
    const fileSize = stub?.size ?? file?.size ?? null;
    if (!fileName) {
      return null;
    }
    return fileSize ? `${fileName} • ${formatFileSize(fileSize)}` : fileName;
  }, [file, stub]);

  return (
    <div className="compare-upload-column" key={`upload-column-${role}`}>
      <Dropzone
        openRef={((instance: (() => void | undefined) | null) => {
          openRef.current = instance ?? null;
        }) as ForwardedRef<() => void | undefined>}
        onDrop={onDrop}
        disabled={disabled}
        multiple
        className="compare-upload-dropzone"
      >
        <div className="compare-upload-card">
          <div className={`compare-upload-icon ${accentClass}`}>
            <LocalIcon icon="upload" width="2.5rem" height="2.5rem" />
          </div>
          <Text fw={600} size="lg">
            {title}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {description}
          </Text>

          <div className="compare-upload-actions">
            <Button
              onClick={() => openRef.current?.()}
              disabled={disabled}
              fullWidth
            >
              {t('compare.upload.browse', 'Browse files')}
            </Button>
            <Button
              variant="outline"
              onClick={onSelectExisting}
              disabled={disabled}
              fullWidth
            >
              {t('compare.upload.selectExisting', 'Select existing')}
            </Button>
          </div>

          {fileLabel ? (
            <div className="compare-upload-selection">
              <Text size="sm" fw={500} lineClamp={2}>
                {fileLabel}
              </Text>
              <Button
                variant="subtle"
                color="gray"
                onClick={onClear}
                disabled={disabled}
                size="xs"
              >
                {t('compare.upload.clearSelection', 'Clear selection')}
              </Button>
            </div>
          ) : (
            <Text size="xs" c="dimmed" ta="center">
              {t('compare.upload.instructions', 'Drag & drop here or use the buttons to choose a file.')}
            </Text>
          )}
        </div>
      </Dropzone>
    </div>
  );
};

const CompareUploadSection = ({
  heading,
  subheading,
  disabled,
  base,
  comparison,
}: CompareUploadSectionProps) => {
  return (
    <Stack className="compare-workbench compare-workbench--upload" gap="lg">
      <Stack gap={4} align="center">
        <Text fw={600} size="lg">
          {heading}
        </Text>
        <Text size="sm" c="dimmed" ta="center" maw={520}>
          {subheading}
        </Text>
      </Stack>
      <div className="compare-upload-layout">
        <CompareUploadColumn {...base} disabled={disabled} />
        <div className="compare-upload-divider" aria-hidden="true" />
        <CompareUploadColumn {...comparison} disabled={disabled} />
      </div>
    </Stack>
  );
};

export default CompareUploadSection;
