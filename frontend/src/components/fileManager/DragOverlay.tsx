import React from 'react';
import { Stack, Text, useMantineTheme, alpha } from '@mantine/core';
import UploadFileIcon from '@mui/icons-material/UploadFile';
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
        border: `2px dashed ${theme.colors.blue[6]}`,
        borderRadius: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        pointerEvents: 'none'
      }}
    >
      <Stack align="center" gap="md">
        <UploadFileIcon style={{ fontSize: 64, color: theme.colors.blue[6] }} />
        <Text size="xl" fw={500} c="blue.6">
          {t('fileManager.dropFilesHere', 'Drop files here to upload')}
        </Text>
      </Stack>
    </div>
  );
};

export default DragOverlay;