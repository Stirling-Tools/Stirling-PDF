import { useTranslation } from "react-i18next";
import { useFileActionTerminology as useNativeFileActionTerminology } from "@editor-tauri/hooks/useFileActionTerminology";

/**
 * The native app's open/save wording, minus what assumes a computer: there is no
 * drag and drop on touch and no computer to open from, so adding a file is all
 * the phone offers.
 */
export function useFileActionTerminology() {
  const { t } = useTranslation();
  const addFiles = t("mobile.files.addFiles", "Add files");

  return {
    ...useNativeFileActionTerminology(),
    dropFilesHere: t("mobile.files.addPrompt", "Add a document to get started"),
    addFiles,
    uploadFromComputer: addFiles,
    noFilesInStorage: t(
      "mobile.files.noneInStorage",
      "No files yet. Add one from this device to get started.",
    ),
  };
}
