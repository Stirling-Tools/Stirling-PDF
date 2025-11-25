import { useTranslation } from 'react-i18next';

/**
 * File action terminology for web builds
 * Desktop builds override this with different terminology
 */
export function useFileActionTerminology() {
  const { t } = useTranslation();

  return {
    uploadFiles: t('fileUpload.uploadFiles', 'Upload Files'),
    uploadFile: t('fileUpload.uploadFile', 'Upload File'),
    upload: t('fileUpload.upload', 'Upload'),
    dropFilesHere: t('fileUpload.dropFilesHere', 'Drop files here or click the upload button'),
    uploadFromComputer: t('landing.uploadFromComputer', 'Upload from computer'),
    download: t('download', 'Download'),
    downloadAll: t('rightRail.downloadAll', 'Download All'),
    downloadSelected: t('fileManager.downloadSelected', 'Download Selected'),
    downloadUnavailable: t('downloadUnavailable', 'Download unavailable for this item'),
    noFilesInStorage: t('fileUpload.noFilesInStorage', 'No files available in storage. Upload some files first.'),
  };
}
