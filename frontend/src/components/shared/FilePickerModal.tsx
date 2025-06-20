import React, { useState, useEffect } from 'react';
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

interface FilePickerModalProps {
  opened: boolean;
  onClose: () => void;
  sharedFiles: any[];
  onSelectFiles: (selectedFiles: any[]) => void;
}

const FilePickerModal = ({
  opened,
  onClose,
  sharedFiles,
  onSelectFiles,
}: FilePickerModalProps) => {
  const { t } = useTranslation();
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  // Reset selection when modal opens
  useEffect(() => {
    if (opened) {
      setSelectedFileIds([]);
    }
  }, [opened]);

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds(prev => 
      prev.includes(fileId) 
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  };

  const selectAll = () => {
    setSelectedFileIds(sharedFiles.map(f => f.id || f.name));
  };

  const selectNone = () => {
    setSelectedFileIds([]);
  };

  const handleConfirm = async () => {
    const selectedFiles = sharedFiles.filter(f => 
      selectedFileIds.includes(f.id || f.name)
    );
    
    // Convert FileWithUrl objects to proper File objects if needed
    const convertedFiles = await Promise.all(
      selectedFiles.map(async (fileItem) => {
        console.log('Converting file item:', fileItem);
        
        // If it's already a File object, return as is
        if (fileItem instanceof File) {
          console.log('File is already a File object');
          return fileItem;
        }
        
        // If it has a file property, use that
        if (fileItem.file && fileItem.file instanceof File) {
          console.log('Using .file property');
          return fileItem.file;
        }
        
        // If it's a FileWithUrl from storage, reconstruct the File
        if (fileItem.arrayBuffer && typeof fileItem.arrayBuffer === 'function') {
          try {
            console.log('Reconstructing file from storage:', fileItem.name, fileItem);
            const arrayBuffer = await fileItem.arrayBuffer();
            console.log('Got arrayBuffer:', arrayBuffer);
            
            const blob = new Blob([arrayBuffer], { type: fileItem.type || 'application/pdf' });
            console.log('Created blob:', blob);
            
            const reconstructedFile = new File([blob], fileItem.name, {
              type: fileItem.type || 'application/pdf',
              lastModified: fileItem.lastModified || Date.now()
            });
            console.log('Reconstructed file:', reconstructedFile, 'instanceof File:', reconstructedFile instanceof File);
            return reconstructedFile;
          } catch (error) {
            console.error('Error reconstructing file:', error, fileItem);
            return null;
          }
        }
        
        console.log('No valid conversion method found for:', fileItem);
        return null; // Don't return invalid objects
      })
    );
    
    // Filter out any null values from failed conversions
    const validFiles = convertedFiles.filter(f => f !== null);
    
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
      title="Select Files from Storage"
      size="lg"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="md">
        {sharedFiles.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No files available in storage. Upload some files first.
          </Text>
        ) : (
          <>
            {/* Selection controls */}
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                {sharedFiles.length} files available
              </Text>
              <Group gap="xs">
                <Button size="xs" variant="light" onClick={selectAll}>
                  Select All
                </Button>
                <Button size="xs" variant="light" onClick={selectNone}>
                  Select None
                </Button>
              </Group>
            </Group>

            {/* File grid */}
            <ScrollArea.Autosize mah={400}>
              <SimpleGrid cols={2} spacing="md">
                {sharedFiles.map((file) => {
                  const fileId = file.id || file.name;
                  const isSelected = selectedFileIds.includes(fileId);
                  
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
                          {file.thumbnail ? (
                            <Image
                              src={file.thumbnail}
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
                            {file.name}
                          </Text>
                          <Group gap="xs">
                            <Badge size="xs" variant="light" color="gray">
                              {formatFileSize(file.size || (file.file?.size || 0))}
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
                {selectedFileIds.length} file{selectedFileIds.length > 1 ? 's' : ''} selected
              </Text>
            )}
          </>
        )}

        {/* Action buttons */}
        <Group justify="flex-end" mt="md">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={selectedFileIds.length === 0}
          >
            Load {selectedFileIds.length > 0 ? `${selectedFileIds.length} ` : ''}Files
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default FilePickerModal;