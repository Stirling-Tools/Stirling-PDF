import { useTranslation } from "react-i18next";

/**
 * File action wording for the phone.
 *
 * Inherited from the desktop layer this said "Drop files here or click the
 * open button" and "Open from computer". There is no drag and drop on touch
 * and there is no computer, so both instructions were wrong wherever they
 * appeared. Saving keeps the desktop wording, because a phone save really is
 * a save to the device rather than a browser download.
 */
export function useFileActionTerminology() {
  const { t } = useTranslation();

  return {
    uploadFiles: t("fileUpload.openFiles", "Open Files"),
    uploadFile: t("fileUpload.openFile", "Open File"),
    upload: t("fileUpload.open", "Open"),
    dropFilesHere: t("mobile.files.addPrompt", "Add a document to get started"),
    addFiles: t("mobile.files.addFiles", "Add files"),
    mobileUpload: t("landing.mobileUpload", "Upload from Mobile"),
    uploadFromComputer: t("mobile.files.addFiles", "Add files"),
    download: t("save", "Save"),
    downloadAll: t("workbenchBar.saveAll", "Save All"),
    downloadSelected: t("fileManager.saveSelected", "Save Selected"),
    downloadUnavailable: t("saveUnavailable", "Save unavailable for this item"),
    noFilesInStorage: t(
      "mobile.files.noneInStorage",
      "No files yet. Add one from this device to get started.",
    ),
  };
}
