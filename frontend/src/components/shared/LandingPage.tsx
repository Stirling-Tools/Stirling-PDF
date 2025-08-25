import React from 'react';
import { Container, Text, Button, Checkbox, Group, useMantineColorScheme } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { useFileHandler } from '../../hooks/useFileHandler';
import { useFilesModalContext } from '../../contexts/FilesModalContext';

const LandingPage = () => {
  const { addMultipleFiles } = useFileHandler();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { colorScheme } = useMantineColorScheme();
  const { t } = useTranslation();
  const { openFilesModal } = useFilesModalContext();
  const [isUploadHover, setIsUploadHover] = React.useState(false);

  const handleFileDrop = async (files: File[]) => {
    await addMultipleFiles(files);
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
      await addMultipleFiles(files);
    }
    // Reset the input so the same file can be selected again
    event.target.value = '';
  };

  return (
    <Container size="lg" p={0} h="100%" className="flex items-center justify-center" style={{ position: 'relative' }}>
      {/* White PDF Page Background */}
      <Dropzone
        onDrop={handleFileDrop}
        accept={["application/pdf", "application/zip", "application/x-zip-compressed"]}
        multiple={true}
        className="w-4/5 flex items-center justify-center h-[95vh]"
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 0,
          borderRadius: '0.5rem 0.5rem 0 0',
          filter: 'var(--drop-shadow-filter)',
          backgroundColor: 'var(--landing-paper-bg)',
          transition: 'background-color 0.4s ease',
        }}
        activateOnClick={false}
        styles={{
          root: {
            '&[dataAccept]': {
              backgroundColor: 'var(--landing-drop-paper-bg)',
            },
          },
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: ".5rem",
            zIndex: 10,

          }}
        >
          <img
            src={colorScheme === 'dark' ? '/branding/StirlingPDFLogoNoTextDark.svg' : '/branding/StirlingPDFLogoNoTextLight.svg'}
            alt="Stirling PDF Logo"
            style={{
              width: '10rem',
              height: 'auto',
              pointerEvents: 'none',
              marginTop: '-0.5rem'
            }}
          />
        </div>
        <div
          className={`min-h-[25vh] flex flex-col items-center justify-center px-8 py-8 w-full min-w-[360px] border transition-all duration-200 dropzone-inner relative`}
          style={{
            borderRadius: '0.5rem',
            backgroundColor: 'var(--landing-inner-paper-bg)',
            borderColor: 'var(--landing-inner-paper-border)',
            borderWidth: '1px',
            borderStyle: 'solid',
          }}
        >
          {/* Logo positioned absolutely in top right corner */}


          {/* Centered content container */}
          <div className="flex flex-col items-center gap-4 flex-none w-full">
            {/* Stirling PDF Branding */}
            <Group gap="xs" align="center">
              <img
                src={colorScheme === 'dark' ? '/branding/StirlingPDFLogoWhiteText.svg' : '/branding/StirlingPDFLogoGreyText.svg'}
                alt="Stirling PDF"
                style={{ height: '2.2rem', width: 'auto' }}
              />
            </Group>

            {/* Add Files + Native Upload Buttons */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                width: '80%',
                marginTop: '0.8rem',
                marginBottom: '0.8rem'
              }}
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
                <AddIcon className="text-[var(--accent-interactive)]" />
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
                  width: isUploadHover ? 'calc(100% - 50px)' : '58px',
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
                <span className="material-symbols-rounded" style={{ fontSize: '1.25rem', color: 'var(--accent-interactive)' }}>upload</span>
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
            className="text-[var(--accent-interactive)]"
            style={{ fontSize: '.8rem' }}
          >
            {t('fileUpload.dropFilesHere', 'Drop files here or click to upload')}
          </span>
        </div>
      </Dropzone>
    </Container>
  );
};

export default LandingPage;
