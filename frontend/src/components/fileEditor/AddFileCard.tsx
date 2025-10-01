import React, { useRef, useState } from 'react';
import { Button, Group, useMantineColorScheme } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import { useFilesModalContext } from '../../contexts/FilesModalContext';
import LocalIcon from '../shared/LocalIcon';
import { BASE_PATH } from '../../constants/app';
import styles from './FileEditor.module.css';

interface AddFileCardProps {
  onFileSelect: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
}

const AddFileCard = ({
  onFileSelect,
  accept = ".pdf,.zip",
  multiple = true
}: AddFileCardProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { openFilesModal } = useFilesModalContext();
  const { colorScheme } = useMantineColorScheme();
  const [isUploadHover, setIsUploadHover] = useState(false);

  const handleNativeUploadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleOpenFilesModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    openFilesModal();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      onFileSelect(files);
    }
    // Reset input so same files can be selected again
    event.target.value = '';
  };

  // Prevent this card from interfering with drag and drop to parent Dropzone
  const handleDragOver = (e: React.DragEvent) => {
    // Don't prevent default - let the parent Dropzone handle it
    // Don't stop propagation - let it bubble up
  };

  const handleDrop = (e: React.DragEvent) => {
    // Don't prevent default or stop propagation
    // Let the parent Dropzone handle the file drop
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div
        className={`${styles.addFileCard} w-[18rem] h-[22rem] select-none flex flex-col shadow-sm transition-all relative`}
        tabIndex={0}
        role="region"
        aria-label={t('fileEditor.addFiles', 'Add files')}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Header bar - matches FileEditorThumbnail structure */}
        <div className={`${styles.header} ${styles.addFileHeader}`}>
          <div className={styles.logoMark}>
            <AddIcon sx={{ color: 'inherit', fontSize: '1.5rem' }} />
          </div>
          <div className={styles.headerIndex}>
            {t('fileEditor.addFiles', 'Add Files')}
          </div>
          <div className={styles.kebab} />
        </div>

        {/* Main content area */}
        <div className={styles.addFileContent}>
          {/* Stirling PDF Branding */}
          <Group gap="xs" align="center">
            <img
              src={colorScheme === 'dark' ? `${BASE_PATH}/branding/StirlingPDFLogoWhiteText.svg` : `${BASE_PATH}/branding/StirlingPDFLogoGreyText.svg`}
              alt="Stirling PDF"
              style={{ height: '2.2rem', width: 'auto' }}
            />
          </Group>

          {/* Add Files + Native Upload Buttons - styled like LandingPage */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              width: '100%',
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

          {/* Instruction Text */}
          <span
            className="text-[var(--accent-interactive)]"
            style={{ fontSize: '.8rem', textAlign: 'center', marginTop: '0.5rem' }}
          >
            {t('fileUpload.dropFilesHere', 'Drop files here or click the upload button')}
          </span>
        </div>
      </div>
    </>
  );
};

export default AddFileCard;