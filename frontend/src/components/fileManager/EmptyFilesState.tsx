import React, { useState } from 'react';
import { Button, Group, Text, Stack, useMantineColorScheme } from '@mantine/core';
import HistoryIcon from '@mui/icons-material/History';
import { useTranslation } from 'react-i18next';
import { useFileManagerContext } from '../../contexts/FileManagerContext';
import LocalIcon from '../shared/LocalIcon';
import { BASE_PATH } from '../../constants/app';

const EmptyFilesState: React.FC = () => {
  const { t } = useTranslation();
  const { colorScheme } = useMantineColorScheme();
  const { onLocalFileClick } = useFileManagerContext();
  const [isUploadHover, setIsUploadHover] = useState(false);

  const handleUploadClick = () => {
    onLocalFileClick();
  };

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}
    >
      {/* Container */}
      <div
        style={{
          backgroundColor: 'transparent',
          padding: '3rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.5rem',
          minWidth: '20rem',
          maxWidth: '28rem',
          width: '100%'
        }}
      >
        {/* No Recent Files Message */}
        <Stack align="center" gap="sm">
          <HistoryIcon style={{ fontSize: '3rem', color: 'var(--mantine-color-gray-5)' }} />
          <Text c="dimmed" ta="center" size="lg">
            {t('fileManager.noRecentFiles', 'No recent files')}
          </Text>
        </Stack>

        {/* Stirling PDF Logo */}
        <Group gap="xs" align="center">
          <img
            src={colorScheme === 'dark' ? `${BASE_PATH}/branding/StirlingPDFLogoWhiteText.svg` : `${BASE_PATH}/branding/StirlingPDFLogoGreyText.svg`}
            alt="Stirling PDF"
            style={{ height: '2.2rem', width: 'auto' }}
          />
        </Group>

        {/* Upload Button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            marginTop: '0.5rem',
            marginBottom: '0.5rem'
          }}
          onMouseLeave={() => setIsUploadHover(false)}
        >
          <Button
            aria-label="Upload"
            style={{
              backgroundColor: 'var(--bg-file-manager)',
              color: 'var(--landing-button-color)',
              border: '1px solid var(--landing-button-border)',
              borderRadius: isUploadHover ? '2rem' : '1rem',
              height: '38px',
              width: isUploadHover ? '100%' : '58px',
              minWidth: '58px',
              paddingLeft: isUploadHover ? '1rem' : 0,
              paddingRight: isUploadHover ? '1rem' : 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'width .5s ease, padding .5s ease, border-radius .5s ease'
            }}
            onClick={handleUploadClick}
            onMouseEnter={() => setIsUploadHover(true)}
          >
            <LocalIcon icon="upload" width="1.25rem" height="1.25rem" style={{ color: 'var(--accent-interactive)' }} />
            {isUploadHover && (
              <span style={{ marginLeft: '.5rem' }}>
                {t('landing.uploadFromComputer', 'Upload from computer')}
              </span>
            )}
          </Button>
        </div>

        {/* Instruction Text */}
        <span
          className="text-[var(--accent-interactive)]"
          style={{ fontSize: '.8rem', textAlign: 'center' }}
        >
          {t('fileUpload.dropFilesHere', 'Drop files here or click the upload button')}
        </span>
      </div>
    </div>
  );
};

export default EmptyFilesState;
