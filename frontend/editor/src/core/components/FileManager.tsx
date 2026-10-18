import { Suspense, lazy, useState } from "react";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { LibraryPickerModal } from "@app/components/filesPage/LibraryPickerModal";

/** Deferred so the virtualised file grid, details panel, and share dialog stay out of the startup bundle. */
const LibraryFilePicker = lazy(() =>
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
