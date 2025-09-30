import React from 'react';
import { Container, Button, Group, useMantineColorScheme } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import LocalIcon from './LocalIcon';
import { useTranslation } from 'react-i18next';
import { useFileHandler } from '../../hooks/useFileHandler';
import { useFilesModalContext } from '../../contexts/FilesModalContext';
import { BASE_PATH } from '../../constants/app';

import './LandingPage.css';

const LandingPage = () => {
  const { addFiles } = useFileHandler();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { colorScheme } = useMantineColorScheme();
  const { t } = useTranslation();
  const { openFilesModal } = useFilesModalContext();
  const [isUploadHover, setIsUploadHover] = React.useState(false);

  const handleFileDrop = async (files: File[]) => {
    await addFiles(files);
  };

  const handleOpenFilesModal = () => {
    openFilesModal();
  };

  const handleNativeUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      await addFiles(files);
    }
    // Reset the input so the same file can be selected again
    event.target.value = '';
  };

  return (
    <Container size="70rem" p={0} h="100%" className="flex items-center justify-center" style={{ position: 'relative' }}>
      {/* White PDF Page Background */}
      <Dropzone
        onDrop={handleFileDrop}
        accept={["application/pdf", "application/zip", "application/x-zip-compressed"]}
        multiple={true}
        className="landing-dropzone"
        activateOnClick={false}
        styles={{
          root: {
            '&[dataAccept]': {
              backgroundColor: 'var(--landing-drop-paper-bg)',
            },
          },
        }}
      >
        <div className="landing-dropzone__sheet dropzone-inner">
          <img
            className="landing-dropzone__badge"
            src={colorScheme === 'dark' ? `${BASE_PATH}/branding/StirlingPDFLogoNoTextDark.svg` : `${BASE_PATH}/branding/StirlingPDFLogoNoTextLight.svg`}
            alt="Stirling PDF Logo"
          />


          {/* Centered content container */}
          <div className="landing-dropzone__body">
            {/* Stirling PDF Branding */}
            <Group gap="xs" align="center" className="landing-dropzone__brand">
              <img
                src={colorScheme === 'dark' ? `${BASE_PATH}/branding/StirlingPDFLogoWhiteText.svg` : `${BASE_PATH}/branding/StirlingPDFLogoGreyText.svg`}
                alt="Stirling PDF"
                style={{ height: '2.2rem', width: 'auto' }}
              />
            </Group>

            {/* Add Files + Native Upload Buttons */}
            <div
              className="landing-dropzone__actions"
              onMouseLeave={() => setIsUploadHover(false)}
            >
              <Button
                style={{
                  backgroundColor: 'var(--landing-button-bg)',
                  color: 'var(--landing-button-color)',
                  border: '1px solid var(--landing-button-border)',
                  borderRadius: '2rem',
                  height: '38px',
                  paddingLeft: isUploadHover ? 0 : '1rem',
                  paddingRight: isUploadHover ? 0 : '1rem',
                  width: isUploadHover ? '58px' : 'calc(100% - 58px - 0.6rem)',
                  minWidth: isUploadHover ? '58px' : undefined,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'width .5s ease, padding .5s ease'
                }}
                onClick={handleOpenFilesModal}
                onMouseEnter={() => setIsUploadHover(false)}
              >
                <LocalIcon icon="add" width="1.5rem" height="1.5rem" className="text-[var(--accent-interactive)]" />
                {!isUploadHover && (
                  <span>
                    {t('landing.addFiles', 'Add Files')}
                  </span>
                )}
              </Button>
              <Button
                aria-label="Upload"
                style={{
                  backgroundColor: 'var(--landing-button-bg)',
                  color: 'var(--landing-button-color)',
                  border: '1px solid var(--landing-button-border)',
                  borderRadius: '1rem',
                  height: '38px',
                  width: isUploadHover ? 'calc(100% - 58px - 0.6rem)' : '58px',
                  minWidth: '58px',
                  paddingLeft: isUploadHover ? '1rem' : 0,
                  paddingRight: isUploadHover ? '1rem' : 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'width .5s ease, padding .5s ease'
                }}
                onClick={handleNativeUploadClick}
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

            {/* Hidden file input for native file picker */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.zip"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

          </div>

          {/* Instruction Text */}
          <span
            className="landing-dropzone__hint"
          >
            {t('fileUpload.dropFilesHere', 'Drop files here or click the upload button')}
          </span>
        </div>
      </Dropzone>
    </Container>
  );
};

export default LandingPage;
