import React, { useEffect } from 'react';
import { Container, Button, Group, useMantineColorScheme } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import LocalIcon from '@app/components/shared/LocalIcon';
import { useTranslation } from 'react-i18next';
import { useFileHandler } from '@app/hooks/useFileHandler';
import { useFilesModalContext } from '@app/contexts/FilesModalContext';
import { BASE_PATH } from '@app/constants/app';
import { useLogoPath } from '@app/hooks/useLogoPath';
import { useFileManager } from '@app/hooks/useFileManager';
import { useFileActionTerminology } from '@app/hooks/useFileActionTerminology';

const LandingPage = () => {
  const { addFiles } = useFileHandler();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { colorScheme } = useMantineColorScheme();
  const { t } = useTranslation();
  const { openFilesModal } = useFilesModalContext();
  const [isUploadHover, setIsUploadHover] = React.useState(false);
  const logoPath = useLogoPath();
  const { loadRecentFiles } = useFileManager();
  const [hasRecents, setHasRecents] = React.useState<boolean>(false);
  const terminology = useFileActionTerminology();

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

  // Determine if the user has any recent files (same source as File Manager)
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const files = await loadRecentFiles();
        if (isMounted) {
          setHasRecents((files?.length || 0) > 0);
        }
      } catch (_err) {
        if (isMounted) setHasRecents(false);
      }
    })();
    return () => { isMounted = false; };
  }, [loadRecentFiles]);

  return (
    <Container size="70rem" p={0} h="100%" className="flex items-center justify-center" style={{ position: 'relative' }}>
      {/* White PDF Page Background */}
      <Dropzone
        onDrop={handleFileDrop}
        multiple={true}
        className="w-4/5 flex items-center justify-center h-[95%]"
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 0,
          borderRadius: '0.25rem 0.25rem 0 0',
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
            right: 0,
            zIndex: 10,

          }}
        >
          <img
            src={logoPath}
            alt="Stirling PDF Logo"
            style={{
              height: 'auto',
              pointerEvents: 'none',
            }}
          />
        </div>
        <div
          className={`min-h-[45vh] flex flex-col items-center justify-center px-8 py-8 w-full min-w-[30rem] max-w-[calc(100%-2rem)] border transition-all duration-200 dropzone-inner relative`}
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
                src={colorScheme === 'dark' ? `${BASE_PATH}/branding/StirlingPDFLogoWhiteText.svg` : `${BASE_PATH}/branding/StirlingPDFLogoGreyText.svg`}
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
              {/* Show both buttons only when recents exist; otherwise show a single Upload button */}
              {hasRecents && (
                <>
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
                    <LocalIcon icon="upload" width="1.25rem" height="1.25rem" style={{ color: 'var(--accent-interactive)' }} />
                    {isUploadHover && (
                      <span style={{ marginLeft: '.5rem' }}>
                        {terminology.uploadFromComputer}
                      </span>
                    )}
                  </Button>
                </>
              )}
              {!hasRecents && (
                <Button
                  aria-label="Upload"
                  style={{
                    backgroundColor: 'var(--landing-button-bg)',
                    color: 'var(--landing-button-color)',
                    border: '1px solid var(--landing-button-border)',
                    borderRadius: '1rem',
                    height: '38px',
                    width: '100%',
                    minWidth: '58px',
                    paddingLeft: '1rem',
                    paddingRight: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onClick={handleNativeUploadClick}
                >
                  <LocalIcon icon="upload" width="1.25rem" height="1.25rem" style={{ color: 'var(--accent-interactive)' }} />
                  <span style={{ marginLeft: '.5rem' }}>
                    {t('landing.uploadFromComputer', 'Upload from computer')}
                  </span>
                </Button>
              )}
            </div>

            {/* Hidden file input for native file picker */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

          </div>

          {/* Instruction Text */}
          <span
            className="text-[var(--accent-interactive)]"
            style={{ fontSize: '.8rem' }}
          >
            {terminology.dropFilesHere}
          </span>
        </div>
      </Dropzone>
    </Container>
  );
};

export default LandingPage;
