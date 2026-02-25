import React from 'react';
import { Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { StirlingFileStub } from '@app/types/fileContext';
import { PrivateContent } from '@app/components/shared/PrivateContent';

interface FileEditorFileNameProps {
  file: StirlingFileStub;
}

const FileEditorFileName = ({ file }: FileEditorFileNameProps) => {
  const { t } = useTranslation();

  return (
    <>
      <PrivateContent>{file.name}</PrivateContent>
      {!file.localFilePath && (
        <Tooltip label={t('fileNotSavedToDisk', 'Not saved to disk')}>
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--mantine-color-red-6)',
              flexShrink: 0
            }}
            aria-label={t('fileNotSavedToDisk', 'Not saved to disk')}
          />
        </Tooltip>
      )}
      {file.localFilePath && file.isDirty && (
        <Tooltip label={t('unsavedChanges', 'Unsaved changes')}>
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--mantine-color-yellow-6)',
              flexShrink: 0
            }}
            aria-label={t('unsavedChanges', 'Unsaved changes')}
          />
        </Tooltip>
      )}
      {file.localFilePath && !file.isDirty && (
        <Tooltip label={t('fileSavedToDisk', 'File saved to disk')}>
          <span
            style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--mantine-color-green-6)',
              flexShrink: 0
            }}
            aria-label={t('fileSavedToDisk', 'File saved to disk')}
          />
        </Tooltip>
      )}
    </>
  );
};

export default FileEditorFileName;
