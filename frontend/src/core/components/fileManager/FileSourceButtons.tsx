import React, { useState } from 'react';
import { Stack, Text, Button, Group } from '@mantine/core';
import HistoryIcon from '@mui/icons-material/History';
import CloudIcon from '@mui/icons-material/Cloud';
import PhonelinkIcon from '@mui/icons-material/Phonelink';
import { useTranslation } from 'react-i18next';
import { useFileManagerContext } from '@app/contexts/FileManagerContext';
import { useGoogleDrivePicker } from '@app/hooks/useGoogleDrivePicker';
import { useFileActionTerminology } from '@app/hooks/useFileActionTerminology';
import { useFileActionIcons } from '@app/hooks/useFileActionIcons';
import MobileUploadModal from '@app/components/shared/MobileUploadModal';

interface FileSourceButtonsProps {
  horizontal?: boolean;
}

const FileSourceButtons: React.FC<FileSourceButtonsProps> = ({
  horizontal = false
}) => {
  const { activeSource, onSourceChange, onLocalFileClick, onGoogleDriveSelect, onNewFilesSelect } = useFileManagerContext();
  const { t } = useTranslation();
  const { isEnabled: isGoogleDriveEnabled, openPicker: openGoogleDrivePicker } = useGoogleDrivePicker();
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();
  const UploadIcon = icons.upload;
  const [mobileUploadModalOpen, setMobileUploadModalOpen] = useState(false);

  const handleGoogleDriveClick = async () => {
    try {
      const files = await openGoogleDrivePicker({ multiple: true });
      if (files.length > 0) {
        onGoogleDriveSelect(files);
      }
    } catch (error) {
      console.error('Failed to pick files from Google Drive:', error);
    }
  };

  const handleMobileUploadClick = () => {
    setMobileUploadModalOpen(true);
  };

  const handleFilesReceivedFromMobile = (files: File[]) => {
    if (files.length > 0) {
      onNewFilesSelect(files);
    }
  };

  const buttonProps = {
    variant: (source: string) => activeSource === source ? 'filled' : 'subtle',
    getColor: (source: string) => activeSource === source ? 'var(--mantine-color-gray-2)' : undefined,
    getStyles: (source: string) => ({
      root: {
        backgroundColor: activeSource === source ? undefined : 'transparent',
        color: activeSource === source ? 'var(--mantine-color-gray-9)' : 'var(--mantine-color-gray-6)',
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
        color='var(--mantine-color-gray-6)'
        leftSection={<UploadIcon />}
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
        {horizontal ? terminology.upload : terminology.uploadFiles}
      </Button>

      <Button
        variant="subtle"
        color='var(--mantine-color-gray-6)'
        leftSection={<CloudIcon />}
        justify={horizontal ? "center" : "flex-start"}
        onClick={handleGoogleDriveClick}
        fullWidth={!horizontal}
        size={horizontal ? "xs" : "sm"}
        disabled={!isGoogleDriveEnabled}
        styles={{
          root: {
            backgroundColor: 'transparent',
            border: 'none',
            '&:hover': {
              backgroundColor: isGoogleDriveEnabled ? 'var(--mantine-color-gray-0)' : 'transparent'
            }
          }
        }}
        title={!isGoogleDriveEnabled ? t('fileManager.googleDriveNotAvailable', 'Google Drive integration not available') : undefined}
      >
        {horizontal ? t('fileManager.googleDriveShort', 'Drive') : t('fileManager.googleDrive', 'Google Drive')}
      </Button>

      <Button
        variant="subtle"
        color='var(--mantine-color-gray-6)'
        leftSection={<PhonelinkIcon />}
        justify={horizontal ? "center" : "flex-start"}
        onClick={handleMobileUploadClick}
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
        {horizontal ? t('fileManager.mobileShort', 'Mobile') : t('fileManager.mobileUpload', 'Mobile Upload')}
      </Button>
    </>
  );

  if (horizontal) {
    return (
      <>
        <Group gap="xs" justify="center" style={{ width: '100%' }}>
          {buttons}
        </Group>
        <MobileUploadModal
          opened={mobileUploadModalOpen}
          onClose={() => setMobileUploadModalOpen(false)}
          onFilesReceived={handleFilesReceivedFromMobile}
        />
      </>
    );
  }

  return (
    <>
      <Stack gap="xs" style={{ height: '100%' }}>
        <Text size="sm" pt="sm" fw={500} c="dimmed" mb="xs" style={{ paddingLeft: '1rem' }}>
          {t('fileManager.myFiles', 'My Files')}
        </Text>
        {buttons}
      </Stack>
      <MobileUploadModal
        opened={mobileUploadModalOpen}
        onClose={() => setMobileUploadModalOpen(false)}
        onFilesReceived={handleFilesReceivedFromMobile}
      />
    </>
  );
};

export default FileSourceButtons;
