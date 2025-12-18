import React from 'react';
import { Stack, Text, useMantineTheme, alpha } from '@mantine/core';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useTranslation } from 'react-i18next';

interface DragOverlayProps {
  isVisible: boolean;
}

const DragOverlay: React.FC<DragOverlayProps> = ({ isVisible }) => {
  const { t } = useTranslation();
  const theme = useMantineTheme();

  if (!isVisible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: alpha(theme.colors.blue[6], 0.1),
        border: `0.125rem dashed ${theme.colors.blue[6]}`,
        borderRadius: '1.875rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        pointerEvents: 'none'
      }}
    >
      <Stack align="center" gap="md">
        <LocalIcon icon="upload-file-rounded" width="4rem" height="4rem" style={{ color: theme.colors.blue[6] }} />
        <Text size="xl" fw={500} c="blue.6">
          {t('fileManager.dropFilesHere', 'Drop files here to upload')}
        </Text>
      </Stack>
    </div>
  );
};

export default DragOverlay;