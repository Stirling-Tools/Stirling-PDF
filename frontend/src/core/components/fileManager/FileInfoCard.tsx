import React from 'react';
import { Stack, Card, Box, Text, Badge, Group, Divider, ScrollArea } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { detectFileExtension, getFileSize } from '@app/utils/fileUtils';
import { StirlingFileStub } from '@app/types/fileContext';
import ToolChain from '@app/components/shared/ToolChain';
import { PrivateContent } from '@app/components/shared/PrivateContent';

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
    <Card withBorder p={0} mah={`calc(${modalHeight} * 0.45)`} style={{ overflow: 'hidden', flexShrink: 1, display: 'flex', flexDirection: 'column' }}>
      <Box bg="gray.4" p="sm" style={{ borderTopLeftRadius: 'var(--mantine-radius-md)', borderTopRightRadius: 'var(--mantine-radius-md)', flexShrink: 0 }}>
        <Text size="sm" fw={500} ta="center" c="white">
          {t('fileManager.details', 'File Details')}
        </Text>
      </Box>
      <ScrollArea style={{ flex: 1, minHeight: 0 }} p="md">
        <Stack gap="sm">
          <Group justify="space-between" py="xs">
            <Text size="sm" c="dimmed">
              <PrivateContent>{t('fileManager.fileName', 'Name')}</PrivateContent>
            </Text>
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
