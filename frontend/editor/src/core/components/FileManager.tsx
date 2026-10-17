import { Suspense, useState } from "react";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { translatedLazy } from "@app/i18n/translatedLazy";
import { LibraryPickerModal } from "@app/components/filesPage/LibraryPickerModal";

/** Deferred: the picker drags in the file grid, its virtualiser, the details panel and the share dialog - the. */
const LibraryFilePicker = translatedLazy(() =>
  import("@app/components/filesPage/LibraryFilePicker").then((module) => ({
    default: module.LibraryFilePicker,
  })),
);

interface FileManagerProps {
  selectedTool?: { supportedFormats?: string[] } | null;
}

/** Unmounting discards tentative selections; file ingestion remains owned by FilesModalContext. */
export default function FileManager({ selectedTool }: FileManagerProps) {
  const { isFilesModalOpen, closeFilesModal, supportedFormats } =
    useFilesModalContext();
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
        <Suspense fallback={null}>
          <LibraryFilePicker
            supportedFormats={
              supportedFormats ?? selectedTool?.supportedFormats
            }
            onBusyChange={setBusy}
            onExternalPickerChange={setExternalPickerOpen}
          />
        </Suspense>
      )}
    </LibraryPickerModal>
  );
}
