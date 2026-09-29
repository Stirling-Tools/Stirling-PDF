import { useState } from "react";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { LibraryFilePicker } from "@app/components/filesPage/LibraryFilePicker";
import { LibraryPickerModal } from "@app/components/filesPage/LibraryPickerModal";

interface FileManagerProps {
  selectedTool?: { supportedFormats?: string[] } | null;
}

/** Unmounting discards tentative selections; file ingestion remains owned by FilesModalContext. */
export default function FileManager({ selectedTool }: FileManagerProps) {
  const { isFilesModalOpen, closeFilesModal } = useFilesModalContext();
  const [busy, setBusy] = useState(false);
  const [externalPickerOpen, setExternalPickerOpen] = useState(false);
  return (
    <LibraryPickerModal
      opened={isFilesModalOpen}
      onClose={closeFilesModal}
      busy={busy}
      externalPickerOpen={externalPickerOpen}
    >
      {isFilesModalOpen && (
        <LibraryFilePicker
          supportedFormats={selectedTool?.supportedFormats}
          onBusyChange={setBusy}
          onExternalPickerChange={setExternalPickerOpen}
        />
      )}
    </LibraryPickerModal>
  );
}
