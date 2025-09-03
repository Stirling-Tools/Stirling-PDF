import React from 'react';
import { Stack, Card, Box, Text, Badge, Group, Divider, ScrollArea } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { detectFileExtension, getFileSize } from '../../utils/fileUtils';
import { FileMetadata } from '../../types/file';

interface FileInfoCardProps {
  currentFile: FileMetadata | null;
  modalHeight: string;
}

const FileInfoCard: React.FC<FileInfoCardProps> = ({
  currentFile,
  modalHeight
}) => {
  const { t } = useTranslation();

  return (
    <Card withBorder p={0} h={`calc(${modalHeight} * 0.38 - 1rem)`} style={{ flex: 1, overflow: 'hidden' }}>
      <Box bg="gray.4" p="sm" style={{ borderTopLeftRadius: 'var(--mantine-radius-md)', borderTopRightRadius: 'var(--mantine-radius-md)' }}>
        <Text size="sm" fw={500} ta="center" c="white">
          {t('fileManager.details', 'File Details')}
        </Text>
      </Box>
      <ScrollArea style={{ flex: 1 }} p="md">
        <Stack gap="sm">
          <Group justify="space-between" py="xs">
            <Text size="sm" c="dimmed">{t('fileManager.fileName', 'Name')}</Text>
            <Text size="sm" fw={500} style={{ maxWidth: '60%', textAlign: 'right' }} truncate>
              {currentFile ? currentFile.name : ''}
            </Text>
          </Group>
          <Divider />

          <Group justify="space-between" py="xs">
            <Text size="sm" c="dimmed">{t('fileManager.fileFormat', 'Format')}</Text>
            {currentFile ? (
              <Badge size="sm" variant="light">
                {detectFileExtension(currentFile.name).toUpperCase()}
              </Badge>
            ) : (
              <Text size="sm" fw={500}></Text>
            )}
          </Group>
          <Divider />

          <Group justify="space-between" py="xs">
            <Text size="sm" c="dimmed">{t('fileManager.fileSize', 'Size')}</Text>
            <Text size="sm" fw={500}>
              {currentFile ? getFileSize(currentFile) : ''}
            </Text>
          </Group>
          <Divider />

          {/* Standard PDF Metadata */}
          {currentFile?.pdfMetadata?.title && (
            <>
              <Group justify="space-between" py="xs">
                <Text size="sm" c="dimmed">{t('fileManager.title', 'Title')}</Text>
                <Text size="sm" fw={500} style={{ maxWidth: '60%', textAlign: 'right' }} truncate>
                  {currentFile.pdfMetadata.title}
                </Text>
              </Group>
              <Divider />
            </>
          )}

          {currentFile?.pdfMetadata?.author && (
            <>
              <Group justify="space-between" py="xs">
                <Text size="sm" c="dimmed">{t('fileManager.author', 'Author')}</Text>
                <Text size="sm" fw={500} style={{ maxWidth: '60%', textAlign: 'right' }} truncate>
                  {currentFile.pdfMetadata.author}
                </Text>
              </Group>
              <Divider />
            </>
          )}

          {currentFile?.pdfMetadata?.subject && (
            <>
              <Group justify="space-between" py="xs">
                <Text size="sm" c="dimmed">{t('fileManager.subject', 'Subject')}</Text>
                <Text size="sm" fw={500} style={{ maxWidth: '60%', textAlign: 'right' }} truncate>
                  {currentFile.pdfMetadata.subject}
                </Text>
              </Group>
              <Divider />
            </>
          )}

          {currentFile?.pdfMetadata?.creationDate && (
            <>
              <Group justify="space-between" py="xs">
                <Text size="sm" c="dimmed">{t('fileManager.created', 'Created')}</Text>
                <Text size="sm" fw={500}>
                  {new Date(currentFile.pdfMetadata.creationDate).toLocaleDateString()}
                </Text>
              </Group>
              <Divider />
            </>
          )}

          <Group justify="space-between" py="xs">
            <Text size="sm" c="dimmed">{t('fileManager.lastModified', 'Last Modified')}</Text>
            <Text size="sm" fw={500}>
              {currentFile ? new Date(currentFile.lastModified).toLocaleDateString() : ''}
            </Text>
          </Group>
          <Divider />

          <Group justify="space-between" py="xs">
            <Text size="sm" c="dimmed">{t('fileManager.fileVersion', 'Version')}</Text>
            {currentFile &&
              <Badge size="sm" variant="light" color={currentFile?.versionNumber ? 'blue' : 'gray'}>
                v{currentFile ? (currentFile.versionNumber || 0) : ''}
              </Badge>}

          </Group>

          {/* Tool Chain Display - Compact */}
          {currentFile?.historyInfo?.toolChain && currentFile.historyInfo.toolChain.length > 0 && (
            <>
              <Divider />
              <Box py="xs">
                <Text size="xs" style={{
                  color: 'var(--mantine-color-blue-6)',
                  lineHeight: 1.3,
                  wordBreak: 'break-word'
                }}>
                  {currentFile.historyInfo.toolChain.map(tool => tool.toolName).join(' → ')}
                </Text>
              </Box>
            </>
          )}
        </Stack>
      </ScrollArea>
    </Card>
  );
};

export default FileInfoCard;
