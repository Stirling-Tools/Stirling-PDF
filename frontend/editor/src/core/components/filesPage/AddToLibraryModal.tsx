import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LibraryPickerModal } from "@app/components/filesPage/LibraryPickerModal";
import { LibraryFilePicker } from "@app/components/filesPage/LibraryFilePicker";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { alert, dismissToast } from "@app/components/toast";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FolderId } from "@app/types/folder";

/** Uploads continue after dismissal, without changing the underlying library navigation. */
export function AddToLibraryModal({
  files,
  onClose,
}: {
  files: StirlingFileStub[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { moveFilesTo } = useFilesPage();
  const [busy, setBusy] = useState(false);
  const add = async (folderId: FolderId | null) => {
    const ids = files.map((file) => file.id);
    onClose();
    const progress = alert({
      title: t("filesPage.addingToLibrary", "Adding to Stirling library…"),
      isPersistentPopup: true,
      expandable: false,
    });
    try {
      await moveFilesTo(ids, folderId, { uploadToRoot: true });
      alert({
        alertType: "success",
        title: t("filesPage.addedToLibrary", "Added to Stirling library"),
        expandable: false,
      });
    } catch (cause) {
      alert({
        alertType: "error",
        title: t(
          "filesPage.addToLibraryFailed",
          "Some files could not be added",
        ),
        body: cause instanceof Error ? cause.message : String(cause),
        isPersistentPopup: true,
      });
    } finally {
      dismissToast(progress);
    }
  };
  return (
    <LibraryPickerModal opened={files.length > 0} onClose={onClose} busy={busy}>
      <LibraryFilePicker
        onBusyChange={setBusy}
        onExternalPickerChange={() => {}}
        destination={{
          fileCount: files.length,
          onClose,
          onConfirm: (folderId) => void add(folderId),
        }}
      />
    </LibraryPickerModal>
  );
}
