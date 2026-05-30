import { Box, Stack, Text } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import UploadFileIcon from "@mui/icons-material/UploadFileOutlined";

interface EmptyStateProps {
  onPickFile: (file: File) => void;
  busy: boolean;
}

export function EmptyState({ onPickFile, busy }: EmptyStateProps) {
  return (
    <Box p="xl" data-testid="v2-empty">
      <Dropzone
        onDrop={(files) => {
          const file = files[0];
          if (file) onPickFile(file);
        }}
        accept={["application/pdf"]}
        multiple={false}
        loading={busy}
        data-testid="v2-dropzone"
      >
        <Stack align="center" gap="xs" py="xl">
          <UploadFileIcon fontSize="large" />
          <Text fw={500}>Drop a PDF here, or click to choose one</Text>
          <Text c="dimmed" size="sm">
            The PDF is opened in your browser. No upload required.
          </Text>
        </Stack>
      </Dropzone>
    </Box>
  );
}
