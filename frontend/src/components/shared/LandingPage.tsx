import React from 'react';
import { Container, Text, Button, Checkbox, Group, useMantineColorScheme } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { useFileHandler } from '../../hooks/useFileHandler';

const LandingPage = () => {
  const { addMultipleFiles } = useFileHandler();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { colorScheme } = useMantineColorScheme();
  const { t } = useTranslation();

  const handleFileDrop = async (files: File[]) => {
    await addMultipleFiles(files);
  };

  const handleAddFilesClick = () => {
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
    <Container size="lg" p="xl" h="100%" className="flex items-center justify-center">
      {/* White PDF Page Background */}
      <Dropzone
        onDrop={handleFileDrop}
        accept={["application/pdf", "application/zip", "application/x-zip-compressed"]}
        multiple={true}
        className="w-4/5 flex items-center justify-center h-full relative"
        style={{
          borderRadius: '.5rem',
          filter: 'var(--drop-shadow-filter)',
          backgroundColor: 'var(--landing-paper-bg)',
          transition: 'background-color 0.2s ease',
        }}
        activateOnClick={false}
        styles={{
          root: {
            '&[data-accept]': {
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

            {/* Add Files Button */}
            <Button
              style={{
                backgroundColor: 'var(--landing-button-bg)',
                color: 'var(--landing-button-color)',
                border: '1px solid var(--landing-button-border)',
                borderRadius: '2rem',
                height: '38px',
                width: '80%',
                marginTop: '0.8rem',
                marginBottom: '0.8rem',

              }}
              onClick={handleAddFilesClick}
            >
              <AddIcon className="text-[var(--accent-interactive)]" />
              <span>
                {t('fileUpload.addFiles', 'Add Files')}
              </span>
            </Button>

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
            {t('fileUpload.dragFilesInOrClick', 'Drag files in or click "Add Files" to browse')}
          </span>
        </div>
      </Dropzone>
    </Container>
  );
};

export default LandingPage;