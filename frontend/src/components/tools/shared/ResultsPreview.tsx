import { Grid, Paper, Box, Image, Text, Loader, Stack, Center } from '@mantine/core';

export interface ResultFile {
  file: File;
  thumbnail?: string;
}

export interface ResultsPreviewProps {
  files: ResultFile[];
  isGeneratingThumbnails?: boolean;
  onFileClick?: (file: File) => void;
  title?: string;
  emptyMessage?: string;
  loadingMessage?: string;
}

const ResultsPreview = ({
  files,
  isGeneratingThumbnails = false,
  onFileClick,
  title,
  emptyMessage = "No files to preview",
  loadingMessage = "Generating previews..."
}: ResultsPreviewProps) => {
  const formatSize = (size: number) => {
    if (size > 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    if (size > 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${size} B`;
  };

  if (files.length === 0 && !isGeneratingThumbnails) {
    return (
      <Text size="sm" c="dimmed">
        {emptyMessage}
      </Text>
    );
  }

  return (
    <Box mt="lg" p="md" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
      {title && (
        <Text fw={500} size="md" mb="sm">
          {title} ({files.length} files)
        </Text>
      )}

      {isGeneratingThumbnails ? (
        <Center p="lg">
          <Stack align="center" gap="sm">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">{loadingMessage}</Text>
          </Stack>
        </Center>
      ) : (
        <Grid>
          {files.map((result, index) => (
            <Grid.Col span={{ base: 6, sm: 4, md: 3 }} key={index}>
              <Paper
                p="xs"
                withBorder
                onClick={() => onFileClick?.(result.file)}
                style={{
                  textAlign: 'center',
                  height: '10rem',
                  width:'5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: onFileClick ? 'pointer' : 'default',
                  transition: 'all 0.2s ease'
                }}
              >
                <Box style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {result.thumbnail ? (
                    <Image
                      src={result.thumbnail}
                      alt={`Preview of ${result.file.name}`}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '9rem',
                        objectFit: 'contain'
                      }}
                    />
                  ) : (
                    <Text size="xs" c="dimmed">No preview</Text>
                  )}
                </Box>
                <Text
                  size="xs"
                  c="dimmed"
                  mt="xs"
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={result.file.name}
                >
                  {result.file.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {formatSize(result.file.size)}
                </Text>
              </Paper>
            </Grid.Col>
          ))}
        </Grid>
      )}
    </Box>
  );
}

export default ResultsPreview;
