import React from 'react';
import { Stack, Text, Button, Group } from '@mantine/core';
import HistoryIcon from '@mui/icons-material/History';
import FolderIcon from '@mui/icons-material/Folder';
import CloudIcon from '@mui/icons-material/Cloud';
import { useTranslation } from 'react-i18next';
import { useFileManagerContext } from './FileManagerContext';

interface FileSourceButtonsProps {
  horizontal?: boolean;
}

const FileSourceButtons: React.FC<FileSourceButtonsProps> = ({ 
  horizontal = false
}) => {
  const { activeSource, onSourceChange, onLocalFileClick } = useFileManagerContext();
  const { t } = useTranslation();

  const buttonProps = {
    variant: (source: string) => activeSource === source ? 'filled' : 'subtle',
    getColor: (source: string) => activeSource === source ? 'var(--mantine-color-gray-4)' : undefined,
    getStyles: (source: string) => ({
      root: {
        backgroundColor: activeSource === source ? undefined : 'transparent',
        border: 'none',
        '&:hover': {
          backgroundColor: activeSource === source ? undefined : 'var(--mantine-color-gray-0)'
        }
      }
    })
  };

  const buttons = (
    <>
      <Button
        variant={buttonProps.variant('recent')}
        leftSection={<HistoryIcon />}
        justify={horizontal ? "center" : "flex-start"}
        onClick={() => onSourceChange('recent')}
        fullWidth={!horizontal}
        size={horizontal ? "xs" : "sm"}
        color={buttonProps.getColor('recent')}
        styles={buttonProps.getStyles('recent')}
      >
        {horizontal ? t('fileManager.recent', 'Recent') : t('fileManager.recent', 'Recent')}
      </Button>
      
      <Button
        variant="subtle"
        color='var(--mantine-color-gray-5)'
        leftSection={<FolderIcon />}
        justify={horizontal ? "center" : "flex-start"}
        onClick={onLocalFileClick}
        fullWidth={!horizontal}
        size={horizontal ? "xs" : "sm"}
        styles={{
          root: {
            backgroundColor: 'transparent',
            border: 'none',
            '&:hover': {
              backgroundColor: 'var(--mantine-color-gray-0)'
            }
          }
        }}
      >
        {horizontal ? t('fileManager.localFiles', 'Local') : t('fileManager.localFiles', 'Local Files')}
      </Button>
      
      <Button
        variant={buttonProps.variant('drive')}
        leftSection={<CloudIcon />}
        justify={horizontal ? "center" : "flex-start"}
        onClick={() => onSourceChange('drive')}
        fullWidth={!horizontal}
        size={horizontal ? "xs" : "sm"}
        disabled
        color={activeSource === 'drive' ? 'gray' : undefined}
        styles={buttonProps.getStyles('drive')}
      >
        {horizontal ? t('fileManager.googleDrive', 'Drive') : t('fileManager.googleDrive', 'Google Drive')}
      </Button>
    </>
  );

  if (horizontal) {
    return (
      <Group gap="md" justify="center" style={{ width: '100%' }}>
        {buttons}
      </Group>
    );
  }

  return (
    <Stack gap="xs" style={{ height: '100%' }}>
      <Text size="sm" fw={500} c="dimmed" mb="xs">
        {t('fileManager.myFiles', 'My Files')}
      </Text>
      {buttons}
    </Stack>
  );
};

export default FileSourceButtons;