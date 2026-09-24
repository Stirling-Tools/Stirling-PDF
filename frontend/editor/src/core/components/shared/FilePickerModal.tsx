import { useState, useEffect } from "react";
import {
  Modal,
  Text,
  Group,
  Stack,
  Checkbox,
  ScrollArea,
  Box,
  Badge,
  SimpleGrid,
} from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import DocumentThumbnail from "@app/components/shared/filePreview/DocumentThumbnail";
import { FileId } from "@app/types/file";
import type { StoredStirlingFileRecord } from "@app/services/fileStorage";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";

type StoredFileItem = Partial<StoredStirlingFileRecord> & {
  id: FileId;
  file?: File;
  arrayBuffer?: () => Promise<ArrayBuffer>;
  processedFile?: { isEncrypted?: boolean };
};

interface FilePickerModalProps {
  opened: boolean;
  onClose: () => void;
  storedFiles: StoredFileItem[];
  onSelectFiles: (selectedFiles: File[]) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface SelectionControlsProps {
  total: number;
  selectedCount: number;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

function SelectionControls({
  total,
  selectedCount,
  onSelectAll,
  onSelectNone,
}: SelectionControlsProps) {
  const { t } = useTranslation();
  return (
    <Group justify="space-between">
      <Text size="sm" c="dimmed">
        {total} {t("fileUpload.filesAvailable", "files available")}
        {selectedCount > 0 && <> • {selectedCount} selected</>}
      </Text>
      <Group gap="xs">
        <Button size="sm" variant="secondary" onClick={onSelectAll}>
          {t("pageEdit.selectAll", "Select All")}
        </Button>
        <Button size="sm" variant="secondary" onClick={onSelectNone}>
          {t("pageEdit.deselectAll", "Select None")}
        </Button>
      </Group>
    </Group>
  );
}

interface StoredFileCardProps {
  file: StoredFileItem;
  selected: boolean;
  onToggle: () => void;
}

function StoredFileCard({ file, selected, onToggle }: StoredFileCardProps) {
  const { t } = useTranslation();
  return (
    <Box
      p="sm"
      style={{
        border: selected
          ? "2px solid var(--mantine-color-blue-6)"
          : "1px solid var(--mantine-color-gray-3)",
        borderRadius: 8,
        backgroundColor: selected
          ? "var(--mantine-color-blue-0)"
          : "transparent",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
      onClick={onToggle}
    >
      <Group gap="sm" align="flex-start">
        <Checkbox
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          aria-label={t("fileUpload.selectFile", "Select {{name}}", {
            name: file.name,
          })}
        />
        <Box
          style={{
            width: 60,
            height: 80,
            border: "1px solid var(--mantine-color-gray-3)",
            borderRadius: 4,
            backgroundColor: "white",
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          <DocumentThumbnail
            file={file.file ?? null}
            thumbnail={
              file.processedFile?.isEncrypted ? undefined : file.thumbnail
            }
            isEncrypted={Boolean(file.processedFile?.isEncrypted)}
            iconSize="2rem"
          />
        </Box>
        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={500} lineClamp={2}>
            {file.name}
          </Text>
          <Group gap="xs">
            <Badge size="xs" variant="light" color="gray">
              {formatFileSize(file.size || file.file?.size || 0)}
            </Badge>
          </Group>
        </Stack>
      </Group>
    </Box>
  );
}

interface StoredFileGridProps {
  files: StoredFileItem[];
  selectedIds: FileId[];
  onToggle: (fileId: FileId) => void;
}

function StoredFileGrid({ files, selectedIds, onToggle }: StoredFileGridProps) {
  return (
    <ScrollArea.Autosize mah={400}>
      <SimpleGrid cols={2} spacing="md">
        {files.map((file) => (
          <StoredFileCard
            key={file.id}
            file={file}
            selected={selectedIds.includes(file.id)}
            onToggle={() => onToggle(file.id)}
          />
        ))}
      </SimpleGrid>
    </ScrollArea.Autosize>
  );
}

function SelectionSummary({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <Text size="sm" c="var(--c-accent-text)" ta="center">
      {count} {t("fileManager.filesSelected", "files selected")}
    </Text>
  );
}

interface StoredFileBrowserProps extends StoredFileGridProps {
  onSelectAll: () => void;
  onSelectNone: () => void;
}

function StoredFileBrowser({
  files,
  selectedIds,
  onToggle,
  onSelectAll,
  onSelectNone,
}: StoredFileBrowserProps) {
  const terminology = useFileActionTerminology();
  if (files.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        {terminology.noFilesInStorage}
      </Text>
    );
  }
  return (
    <>
      <SelectionControls
        total={files.length}
        selectedCount={selectedIds.length}
        onSelectAll={onSelectAll}
        onSelectNone={onSelectNone}
      />
      <StoredFileGrid
        files={files}
        selectedIds={selectedIds}
        onToggle={onToggle}
      />
      <SelectionSummary count={selectedIds.length} />
    </>
  );
}

interface PickerActionsProps {
  selectedCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

function PickerActions({
  selectedCount,
  onCancel,
  onConfirm,
}: PickerActionsProps) {
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();
  return (
    <Group justify="flex-end" mt="md">
      <Button variant="secondary" onClick={onCancel}>
        {t("close", "Cancel")}
      </Button>
      <Button onClick={onConfirm} disabled={selectedCount === 0}>
        {selectedCount > 0
          ? `${t("fileUpload.loadFromStorage", "Load")} ${selectedCount} ${terminology.uploadFiles}`
          : t("fileUpload.loadFromStorage", "Load Files")}
      </Button>
    </Group>
  );
}

const FilePickerModal = ({
  opened,
  onClose,
  storedFiles,
  onSelectFiles,
}: FilePickerModalProps) => {
  const { t } = useTranslation();
  const [selectedFileIds, setSelectedFileIds] = useState<FileId[]>([]);

  // Reset selection when modal opens
  useEffect(() => {
    if (opened) {
      setSelectedFileIds([]);
    }
  }, [opened]);

  const toggleFileSelection = (fileId: FileId) => {
    setSelectedFileIds((prev) => {
      return prev.includes(fileId)
        ? prev.filter((id) => id !== fileId)
        : [...prev, fileId];
    });
  };

  const selectAll = () => {
    setSelectedFileIds(storedFiles.map((f) => f.id).filter(Boolean));
  };

  const selectNone = () => {
    setSelectedFileIds([]);
  };

  const handleConfirm = async () => {
    const selectedFiles = storedFiles.filter((f) =>
      selectedFileIds.includes(f.id),
    );

    // Convert stored files to File objects
    const convertedFiles = await Promise.all(
      selectedFiles.map(async (fileItem) => {
        try {
          // If it's already a File object, return as is
          if (fileItem instanceof File) {
            return fileItem;
          }

          // If it has a file property, use that
          if (fileItem.file && fileItem.file instanceof File) {
            return fileItem.file;
          }

          // If it's from IndexedDB storage, reconstruct the File
          if (
            fileItem.arrayBuffer &&
            typeof fileItem.arrayBuffer === "function"
          ) {
            const arrayBuffer = await fileItem.arrayBuffer();
            const blob = new Blob([arrayBuffer], {
              type: fileItem.type || "application/pdf",
            });
            return new File([blob], fileItem.name ?? "", {
              type: fileItem.type || "application/pdf",
              lastModified: fileItem.lastModified || Date.now(),
            });
          }

          // If it has data property, reconstruct the File
          if (fileItem.data) {
            const blob = new Blob([fileItem.data], {
              type: fileItem.type || "application/pdf",
            });
            return new File([blob], fileItem.name ?? "", {
              type: fileItem.type || "application/pdf",
              lastModified: fileItem.lastModified || Date.now(),
            });
          }

          console.warn("Could not convert file item:", fileItem);
          return null;
        } catch (error) {
          console.error("Error converting file:", error, fileItem);
          return null;
        }
      }),
    );

    // Filter out any null values and return valid Files
    const validFiles = convertedFiles.filter((f): f is File => f !== null);

    onSelectFiles(validFiles);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("fileUpload.selectFromStorage", "Select Files from Storage")}
      size="lg"
      scrollAreaComponent={ScrollArea.Autosize}
      zIndex={1100}
    >
      <Stack gap="md">
        <StoredFileBrowser
          files={storedFiles}
          selectedIds={selectedFileIds}
          onToggle={toggleFileSelection}
          onSelectAll={selectAll}
          onSelectNone={selectNone}
        />
        <PickerActions
          selectedCount={selectedFileIds.length}
          onCancel={onClose}
          onConfirm={handleConfirm}
        />
      </Stack>
    </Modal>
  );
};

export default FilePickerModal;
