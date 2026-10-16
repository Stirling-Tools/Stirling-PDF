import { useTranslation } from "react-i18next";

/**
 * File action wording for the phone.
 *
 * Files are opened and saved through the native pickers, not uploaded to and
 * downloaded from a browser, and there is no drag and drop on touch or
 * computer to upload from, so neither the web nor the desktop wording fits.
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
