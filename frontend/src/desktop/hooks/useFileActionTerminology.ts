import { useTranslation } from 'react-i18next';

/**
 * File action terminology for desktop builds
 * Overrides core implementation with desktop-appropriate terminology
 */
export function useFileActionTerminology() {
  const { t } = useTranslation();

  return {
    uploadFiles: t('fileUpload.openFiles', 'Open Files'),
    uploadFile: t('fileUpload.openFile', 'Open File'),
    upload: t('fileUpload.open', 'Open'),
    dropFilesHere: t('fileUpload.dropFilesHereOpen', 'Drop files here or click the open button'),
    uploadFromComputer: t('landing.openFromComputer', 'Open from computer'),
    download: t('save', 'Save'),
    downloadAll: t('rightRail.saveAll', 'Save All'),
    downloadSelected: t('fileManager.saveSelected', 'Save Selected'),
    downloadUnavailable: t('saveUnavailable', 'Save unavailable for this item'),
    noFilesInStorage: t('fileUpload.noFilesInStorageOpen', 'No files available in storage. Open some files first.'),
  };
}
