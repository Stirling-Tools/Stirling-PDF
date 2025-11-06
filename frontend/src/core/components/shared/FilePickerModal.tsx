import { useState, useEffect } from 'react';
import {
  Modal,
  Text,
  Button,
  Group,
  Stack,
  Checkbox,
  ScrollArea,
  Box,
  Image,
  Badge,
  ThemeIcon,
  SimpleGrid
} from '@mantine/core';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useTranslation } from 'react-i18next';
import { FileId } from '@app/types/file';
import { createQuickKey } from '@app/types/fileContext';

interface StoredFileRecord {
  id?: FileId;
  name: string;
  size?: number;
  type?: string;
  lastModified?: number;
  thumbnail?: string;
  file?: File;
  data?: ArrayBuffer | Blob | Uint8Array;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

type StoredFileItem = File | StoredFileRecord;

interface FilePickerModalProps {
  opened: boolean;
  onClose: () => void;
  storedFiles: StoredFileItem[]; // Files from storage (various formats supported)
  onSelectFiles: (selectedFiles: File[]) => void;
}

const FilePickerModal = ({
  opened,
  onClose,
  storedFiles,
  onSelectFiles,
}: FilePickerModalProps) => {
  const { t } = useTranslation();
  const [selectedFileIds, setSelectedFileIds] = useState<FileId[]>([]);

  const toBlobPart = (data: ArrayBuffer | Blob | Uint8Array): BlobPart => {
    if (data instanceof Blob) {
      return data;
    }
    if (data instanceof Uint8Array) {
      const cloned = new Uint8Array(data.byteLength);
      cloned.set(data);
      return cloned.buffer;
    }
    return data;
  };

  const resolveFileId = (item: StoredFileItem): FileId => {
    if ('id' in item && item.id) {
      return item.id;
    }
    if (item instanceof File) {
      return createQuickKey(item) as FileId;
    }
    return `${item.name}-${item.lastModified ?? ''}` as FileId;
  };

  const resolveFileSize = (item: StoredFileItem): number => {
    if (item instanceof File) {
      return item.size;
    }
    if (typeof item.size === 'number') {
      return item.size;
    }
    if (item.file) {
      return item.file.size;
    }
    return 0;
  };

  const resolveThumbnail = (item: StoredFileItem): string | undefined => {
    if (!item || item instanceof File) {
      return undefined;
    }
    return item.thumbnail;
  };

  // Reset selection when modal opens
  useEffect(() => {
    if (opened) {
      setSelectedFileIds([]);
    }
  }, [opened]);

  const toggleFileSelection = (fileId: FileId) => {
    setSelectedFileIds(prev => {
      return prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId];
    });
  };

  const selectAll = () => {
    setSelectedFileIds(storedFiles.map(resolveFileId));
  };

  const selectNone = () => {
    setSelectedFileIds([]);
  };

  const handleConfirm = async () => {
    const selectedFiles = storedFiles.filter(f =>
      selectedFileIds.includes(resolveFileId(f))
    );

    // Convert stored files to File objects
    const convertedFiles = await Promise.all(
      selectedFiles.map(async (fileItem) => {
        try {
          // If it's already a File object, return as is
          if (fileItem instanceof File) {
            return fileItem;
          }

          if ('file' in fileItem && fileItem.file instanceof File) {
            return fileItem.file;
          }

          // If it's from IndexedDB storage, reconstruct the File
          if (typeof fileItem.arrayBuffer === 'function') {
            const arrayBuffer = await fileItem.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: fileItem.type || 'application/pdf' });
            return new File([blob], fileItem.name, {
              type: fileItem.type || 'application/pdf',
              lastModified: fileItem.lastModified || Date.now()
            });
          }

          // If it has data property, reconstruct the File
          if (fileItem.data) {
            const blobSource = toBlobPart(fileItem.data);
            const blob = new Blob([blobSource], { type: fileItem.type || 'application/pdf' });
            return new File([blob], fileItem.name, {
              type: fileItem.type || 'application/pdf',
              lastModified: fileItem.lastModified || Date.now()
            });
          }

          console.warn('Could not convert file item:', fileItem);
          return null;
        } catch (error) {
          console.error('Error converting file:', error, fileItem);
          return null;
        }
      })
    );

    // Filter out any null values and return valid Files
    const validFiles = convertedFiles.filter((f): f is File => f !== null);

    onSelectFiles(validFiles);
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
        {storedFiles.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {t("fileUpload.noFilesInStorage", "No files available in storage. Upload some files first.")}
          </Text>
        ) : (
          <>
            {/* Selection controls */}
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {storedFiles.length} {t("fileUpload.filesAvailable", "files available")}
                {selectedFileIds.length > 0 && (
                  <> • {selectedFileIds.length} selected</>
                )}
              </Text>
              <Group gap="xs">
                <Button size="xs" variant="light" onClick={selectAll}>
                  {t("pageEdit.selectAll", "Select All")}
                </Button>
                <Button size="xs" variant="light" onClick={selectNone}>
                  {t("pageEdit.deselectAll", "Select None")}
                </Button>
              </Group>
            </Group>

            {/* File grid */}
            <ScrollArea.Autosize mah={400}>
              <SimpleGrid cols={2} spacing="md">
                {storedFiles.map((file) => {
                  const fileId = resolveFileId(file);
                  const isSelected = selectedFileIds.includes(fileId);
                  const thumbnail = resolveThumbnail(file);
                  const fileSize = resolveFileSize(file);
                  const displayName = file instanceof File ? file.name : file.name;

                  return (
                    <Box
                      key={fileId}
                      p="sm"
                      style={{
                        border: isSelected
                          ? '2px solid var(--mantine-color-blue-6)'
                          : '1px solid var(--mantine-color-gray-3)',
                        borderRadius: 8,
                        backgroundColor: isSelected
                          ? 'var(--mantine-color-blue-0)'
                          : 'transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onClick={() => toggleFileSelection(fileId)}
                    >
                      <Group gap="sm" align="flex-start">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleFileSelection(fileId)}
                          onClick={(e) => e.stopPropagation()}
                        />

                        {/* Thumbnail */}
                        <Box
                          style={{
                            width: 60,
                            height: 80,
                            border: '1px solid var(--mantine-color-gray-3)',
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: 'var(--mantine-color-gray-0)',
                            flexShrink: 0
                          }}
                        >
                          {thumbnail ? (
                            <Image
                              src={thumbnail}
                              alt="PDF thumbnail"
                              height={70}
                              width={50}
                              fit="contain"
                            />
                          ) : (
                            <ThemeIcon
                              variant="light"
                              color="red"
                              size={40}
                            >
                              <PictureAsPdfIcon style={{ fontSize: 24 }} />
                            </ThemeIcon>
                          )}
                        </Box>

                        {/* File info */}
                        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                          <Text size="sm" fw={500} lineClamp={2}>
                            {displayName}
                          </Text>
                          <Group gap="xs">
                            <Badge size="xs" variant="light" color="gray">
                              {formatFileSize(fileSize)}
                            </Badge>
                          </Group>
                        </Stack>
                      </Group>
                    </Box>
                  );
                })}
              </SimpleGrid>
            </ScrollArea.Autosize>

            {/* Selection summary */}
            {selectedFileIds.length > 0 && (
              <Text size="sm" c="blue" ta="center">
                {selectedFileIds.length} {t("fileManager.filesSelected", "files selected")}
              </Text>
            )}
          </>
        )}

        {/* Action buttons */}
        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={onClose}>
            {t("close", "Cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedFileIds.length === 0}
          >
            {selectedFileIds.length > 0
              ? `${t("fileUpload.loadFromStorage", "Load")} ${selectedFileIds.length} ${t("fileUpload.uploadFiles", "Files")}`
              : t("fileUpload.loadFromStorage", "Load Files")
            }
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default FilePickerModal;
