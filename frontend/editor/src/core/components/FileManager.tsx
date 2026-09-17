import { useState } from "react";
import { Modal } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { LibraryFilePicker } from "@app/components/filesPage/LibraryFilePicker";
import { Z_INDEX_FILE_MANAGER_MODAL } from "@app/styles/zIndex";

interface FileManagerProps {
  selectedTool?: { supportedFormats?: string[] } | null;
}

/** Unmounting discards tentative selections; file ingestion remains owned by FilesModalContext. */
export default function FileManager({ selectedTool }: FileManagerProps) {
  const { isFilesModalOpen, closeFilesModal } = useFilesModalContext();
  const mobile = useMediaQuery("(max-width: 640px)") ?? false;
  const [busy, setBusy] = useState(false);
  const [externalPickerOpen, setExternalPickerOpen] = useState(false);
  return (
    <Modal
      opened={isFilesModalOpen}
      onClose={() => {
        if (!busy) closeFilesModal();
      }}
      fullScreen={mobile}
      size="min(1280px, 94vw)"
      centered
      withCloseButton={false}
      padding={0}
      radius="md"
      zIndex={Z_INDEX_FILE_MANAGER_MODAL}
      trapFocus={!externalPickerOpen}
      closeOnEscape={!busy && !externalPickerOpen}
      closeOnClickOutside={!busy && !externalPickerOpen}
    >
      {isFilesModalOpen && (
        <LibraryFilePicker
          supportedFormats={selectedTool?.supportedFormats}
          onBusyChange={setBusy}
          onExternalPickerChange={setExternalPickerOpen}
        />
      )}
    </Modal>
  );
}
