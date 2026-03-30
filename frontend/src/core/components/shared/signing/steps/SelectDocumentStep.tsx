import { Button, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import type { FileState } from '@app/types/file';

interface SelectDocumentStepProps {
  selectedFiles: FileState[];
  onNext: () => void;
}

export const SelectDocumentStep: React.FC<SelectDocumentStepProps> = ({
  selectedFiles,
  onNext,
}) => {
  const { t } = useTranslation();

  const hasValidFile = selectedFiles.length === 1;
  const selectedFile = hasValidFile ? selectedFiles[0] : null;

  return (
    <Stack gap="md">
      {!hasValidFile ? (
        <Text size="sm" c="dimmed" ta="center">
          {t(
            'groupSigning.steps.selectDocument.noFile',
            'Please select a single PDF file from your active files to create a signing session.'
          )}
        </Text>
      ) : (
        <>
          <div>
            <Text size="sm" c="dimmed" mb="xs">
              {t('groupSigning.steps.selectDocument.selectedFile', 'Selected document')}
            </Text>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-default)',
                backgroundColor: 'var(--mantine-color-default-hover)',
              }}
            >
              <PictureAsPdfIcon sx={{ fontSize: 32, color: 'var(--mantine-color-red-6)' }} />
              <div style={{ flex: 1 }}>
                <Text size="sm" fw={600}>
                  {selectedFile?.name}
                </Text>
                {selectedFile?.size && (
                  <Text size="xs" c="dimmed">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </Text>
                )}
              </div>
            </div>
          </div>

          <Button onClick={onNext} fullWidth>
            {t('groupSigning.steps.selectDocument.continue', 'Continue to Participant Selection')}
          </Button>
        </>
      )}
    </Stack>
  );
};
