/**
 * Import tab — document upload dropzone + AI extraction + review UI.
 */
import { useCallback } from 'react';
import {
  Stack,
  Text,
  Button,
  Progress,
  Loader,
  Alert,
  Checkbox,
  TextInput,
  Group,
  Paper,
  Badge,
} from '@mantine/core';
import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { DocumentImport } from './useDocumentImport';
import type { KnowledgeStore } from './useKnowledgeStore';

interface ImportTabProps {
  documentImport: DocumentImport;
  knowledge: KnowledgeStore;
}

export function ImportTab({ documentImport, knowledge }: ImportTabProps) {
  const { state, extractionProgress, proposedProfiles, error } = documentImport;

  const handleDrop = useCallback(
    (files: File[]) => {
      if (files.length > 0) {
        const entityNames = knowledge.entityStore.entities.map((e) => e.name);
        documentImport.startImport(files, entityNames);
      }
    },
    [documentImport]
  );

  const handleCommit = useCallback(() => {
    documentImport.acceptAndCommit(knowledge);
  }, [documentImport, knowledge]);

  // Idle — show dropzone
  if (state === 'idle') {
    return (
      <Stack gap="md">
        <Dropzone
          onDrop={handleDrop}
          accept={[MIME_TYPES.pdf]}
          multiple
          styles={{
            root: {
              minHeight: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px dashed var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-md)',
              cursor: 'pointer',
            },
          }}
        >
          <Stack align="center" gap="xs">
            <UploadFileIcon sx={{ fontSize: 40, color: 'var(--mantine-color-dimmed)' }} />
            <Text size="sm" c="dimmed" ta="center">
              Drop PDF files here or click to browse
            </Text>
            <Text size="xs" c="dimmed">
              Upload CVs, resumes, IDs, or any documents containing personal information
            </Text>
          </Stack>
        </Dropzone>
      </Stack>
    );
  }

  // Extracting text
  if (state === 'extracting_text') {
    return (
      <Stack align="center" gap="md" mt="xl">
        <Loader size="lg" />
        <Text size="sm" c="dimmed">
          Extracting text from {extractionProgress.total} file{extractionProgress.total > 1 ? 's' : ''}...
        </Text>
        <Progress
          value={(extractionProgress.completed / extractionProgress.total) * 100}
          size="sm"
          style={{ width: '60%' }}
        />
      </Stack>
    );
  }

  // Calling AI
  if (state === 'calling_ai') {
    return (
      <Stack align="center" gap="md" mt="xl">
        <Loader size="lg" />
        <Text size="sm" c="dimmed">AI is analysing your documents...</Text>
      </Stack>
    );
  }

  // Error
  if (state === 'error') {
    return (
      <Stack gap="md" mt="md">
        <Alert icon={<WarningAmberIcon />} color="red" variant="light">
          {error || 'Something went wrong.'}
        </Alert>
        <Button variant="subtle" onClick={documentImport.reset}>
          Try Again
        </Button>
      </Stack>
    );
  }

  // Reviewing
  return (
    <Stack gap="md">
      <Group gap={6}>
        <CheckCircleIcon sx={{ fontSize: 18, color: 'var(--mantine-color-green-6)' }} />
        <Text size="sm" fw={600}>
          Found {proposedProfiles.length} profile{proposedProfiles.length > 1 ? 's' : ''}
        </Text>
      </Group>

      {proposedProfiles.map((profile, pi) => (
        <Paper key={pi} withBorder p="sm" radius="sm">
          <Group gap="xs" mb="xs">
            <Checkbox
              size="xs"
              checked={profile.accepted}
              onChange={() => documentImport.toggleProfile(pi)}
            />
            <TextInput
              size="xs"
              value={profile.name}
              onChange={(e) => documentImport.setProfileName(pi, e.currentTarget.value)}
              styles={{ input: { fontSize: '0.8125rem', fontWeight: 600 } }}
              style={{ flex: 1 }}
            />
            {profile.sourceDocuments.length > 0 && (
              <Badge size="xs" variant="light">
                {profile.sourceDocuments.join(', ')}
              </Badge>
            )}
          </Group>

          {profile.accepted && (
            <Stack gap={4} ml="xl">
              {profile.entries.map((entry, ei) => (
                <Group key={ei} gap="xs" wrap="nowrap">
                  <Checkbox
                    size="xs"
                    checked={entry.accepted}
                    onChange={() => documentImport.toggleEntry(pi, ei)}
                  />
                  <Text size="xs" c="dimmed" w={120} style={{ flexShrink: 0 }}>
                    {entry.key}
                  </Text>
                  <TextInput
                    size="xs"
                    value={entry.value}
                    onChange={(e) => documentImport.editEntryValue(pi, ei, e.currentTarget.value)}
                    style={{ flex: 1 }}
                    styles={{ input: { fontSize: '0.8125rem' } }}
                    disabled={!entry.accepted}
                  />
                </Group>
              ))}
            </Stack>
          )}
        </Paper>
      ))}

      <Group gap="xs">
        <Button variant="subtle" size="xs" onClick={documentImport.reset}>
          Cancel
        </Button>
        <Button
          size="xs"
          style={{ flex: 1 }}
          onClick={handleCommit}
          disabled={!proposedProfiles.some((p) => p.accepted && p.entries.some((e) => e.accepted))}
        >
          Apply {proposedProfiles.filter((p) => p.accepted).length} Profile{proposedProfiles.filter((p) => p.accepted).length !== 1 ? 's' : ''}
        </Button>
      </Group>
    </Stack>
  );
}
