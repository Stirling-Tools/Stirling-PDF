import { Stack, Text } from '@mantine/core';
import { formatFileSize, getFileDate } from '@app/utils/fileUtils';

export interface FileMetadataProps {
  file: File;
}

const FileMetadata = ({ file }: FileMetadataProps) => {
  return (
    <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
      <Stack gap="0.125rem">
        <Text size="xs" c="dimmed">
          {formatFileSize(file.size)}
        </Text>
        <Text size="xs" c="dimmed">
          {file.type || 'Unknown'}
        </Text>
        <Text size="xs" c="dimmed">
          {getFileDate(file)}
        </Text>
      </Stack>
    </Stack>
  );
};

export default FileMetadata;
