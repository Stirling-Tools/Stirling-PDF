import React from 'react';
import {
  Stack,
  Paper,
  Text,
  Badge,
  Group,
  Collapse,
  Box,
  ScrollArea,
  Code,
  Divider
} from '@mantine/core';
import { useFileContext } from '../../contexts/FileContext';
import { FileOperation, FileOperationHistory as FileOperationHistoryType } from '../../types/fileContext';
import { PageOperation } from '../../types/pageEditor';

interface FileOperationHistoryProps {
  fileId: string;
  showOnlyApplied?: boolean;
  maxHeight?: number;
}

const FileOperationHistory: React.FC<FileOperationHistoryProps> = ({
  fileId,
  showOnlyApplied = false,
  maxHeight = 400
}) => {
  const { getFileHistory, getAppliedOperations } = useFileContext();
  
  const history = getFileHistory(fileId);
  const operations = showOnlyApplied ? getAppliedOperations(fileId) : history?.operations || [];

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'split': return '✂️';
      case 'merge': return '🔗';
      case 'compress': return '🗜️';
      case 'rotate': return '🔄';
      case 'delete': return '🗑️';
      case 'move': return '↕️';
      case 'insert': return '📄';
      case 'upload': return '⬆️';
      case 'add': return '➕';
      case 'remove': return '➖';
      case 'replace': return '🔄';
      case 'convert': return '🔄';
      default: return '⚙️';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'applied': return 'green';
      case 'failed': return 'red';
      case 'pending': return 'yellow';
      default: return 'gray';
    }
  };

  const renderOperationDetails = (operation: FileOperation | PageOperation) => {
    if ('metadata' in operation && operation.metadata) {
      const { metadata } = operation;
      return (
        <Box mt="xs">
          {metadata.parameters && (
            <Text size="xs" c="dimmed">
              Parameters: <Code>{JSON.stringify(metadata.parameters, null, 2)}</Code>
            </Text>
          )}
          {metadata.originalFileName && (
            <Text size="xs" c="dimmed">
              Original file: {metadata.originalFileName}
            </Text>
          )}
          {metadata.outputFileNames && (
            <Text size="xs" c="dimmed">
              Output files: {metadata.outputFileNames.join(', ')}
            </Text>
          )}
          {metadata.fileSize && (
            <Text size="xs" c="dimmed">
              File size: {(metadata.fileSize / 1024 / 1024).toFixed(2)} MB
            </Text>
          )}
          {metadata.pageCount && (
            <Text size="xs" c="dimmed">
              Pages: {metadata.pageCount}
            </Text>
          )}
          {metadata.error && (
            <Text size="xs" c="red">
              Error: {metadata.error}
            </Text>
          )}
        </Box>
      );
    }
    return null;
  };

  if (!history || operations.length === 0) {
    return (
      <Paper p="md" withBorder>
        <Text c="dimmed" ta="center">
          {showOnlyApplied ? 'No applied operations found' : 'No operation history available'}
        </Text>
      </Paper>
    );
  }

  return (
    <Paper p="md" withBorder>
      <Group justify="space-between" mb="md">
        <Text fw={500}>
          {showOnlyApplied ? 'Applied Operations' : 'Operation History'}
        </Text>
        <Badge variant="light" color="blue">
          {operations.length} operations
        </Badge>
      </Group>

      <ScrollArea h={maxHeight}>
        <Stack gap="sm">
          {operations.map((operation, index) => (
            <Paper key={operation.id} p="sm" withBorder radius="sm" bg="gray.0">
              <Group justify="space-between" align="start">
                <Group gap="xs">
                  <Text span size="lg">
                    {getOperationIcon(operation.type)}
                  </Text>
                  <Box>
                    <Text fw={500} size="sm">
                      {operation.type.charAt(0).toUpperCase() + operation.type.slice(1)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {formatTimestamp(operation.timestamp)}
                    </Text>
                  </Box>
                </Group>
                
                <Badge
                  variant="filled"
                  color={getStatusColor(operation.status)}
                  size="sm"
                >
                  {operation.status}
                </Badge>
              </Group>

              {renderOperationDetails(operation)}

              {index < operations.length - 1 && <Divider mt="sm" />}
            </Paper>
          ))}
        </Stack>
      </ScrollArea>

      {history && (
        <Group justify="space-between" mt="sm" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
          <Text size="xs" c="dimmed">
            Created: {formatTimestamp(history.createdAt)}
          </Text>
          <Text size="xs" c="dimmed">
            Last modified: {formatTimestamp(history.lastModified)}
          </Text>
        </Group>
      )}
    </Paper>
  );
};

export default FileOperationHistory;