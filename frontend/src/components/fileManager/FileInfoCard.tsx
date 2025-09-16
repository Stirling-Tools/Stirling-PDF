import React from 'react';
import { Stack, Card, Box, Text, Badge, Group, Divider, ScrollArea } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { detectFileExtension, getFileSize } from '../../utils/fileUtils';
import { StirlingFileStub } from '../../types/fileContext';
import ToolChain from '../shared/ToolChain';

interface FileInfoCardProps {
  currentFile: StirlingFileStub | null;
  modalHeight: string;
}

const FileInfoCard: React.FC<FileInfoCardProps> = ({
  currentFile,
  modalHeight
}) => {
  const { t } = useTranslation();

  return (
    <Card withBorder p={0} h={`calc(${modalHeight} * 0.32 - 1rem)`} style={{ flex: 1, overflow: 'hidden' }}>
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
                v{currentFile ? (currentFile.versionNumber || 1) : ''}
              </Badge>}

          </Group>

          {/* Tool Chain Display */}
          {currentFile?.toolHistory && currentFile.toolHistory.length > 0 && (
            <>
              <Divider />
              <Box py="xs">
                <Text size="xs" c="dimmed" mb="xs">{t('fileManager.toolChain', 'Tools Applied')}</Text>
                <ToolChain
                  toolChain={currentFile.toolHistory}
                  displayStyle="badges"
                  size="xs"
                />
              </Box>
            </>
          )}
        </Stack>
      </ScrollArea>
    </Card>
  );
};

export default FileInfoCard;
