import React, { useState, useEffect } from "react";
import { Card, Group, Text, Stack, Image, Badge, Button, Box, Flex, ThemeIcon } from "@mantine/core";
import { Dropzone, MIME_TYPES } from "@mantine/dropzone";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

GlobalWorkerOptions.workerSrc =
  (import.meta as any).env?.PUBLIC_URL
    ? `${(import.meta as any).env.PUBLIC_URL}/pdf.worker.js`
    : "/pdf.worker.js";

export interface FileWithUrl extends File {
  url?: string;
  file?: File;
}

function getFileDate(file: File): string {
  if (file.lastModified) {
    return new Date(file.lastModified).toLocaleString();
  }
  return "Unknown";
}

function getFileSize(file: File): string {
  if (!file.size) return "Unknown";
  if (file.size < 1024) return `${file.size} B`;
  if (file.size < 1024 * 1024) return `${(file.size / 1024).toFixed(1)} KB`;
  return `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
}

function usePdfThumbnail(file: File | undefined | null): string | null {
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function generate() {
      if (!file) return;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (context) {
          await page.render({ canvasContext: context, viewport }).promise;
          if (!cancelled) setThumb(canvas.toDataURL());
        }
      } catch {
        if (!cancelled) setThumb(null);
      }
    }
    generate();
    return () => { cancelled = true; };
  }, [file]);

  return thumb;
}

interface FileCardProps {
  file: File;
  onRemove: () => void;
  onDoubleClick?: () => void;
}

function FileCard({ file, onRemove, onDoubleClick }: FileCardProps) {
  const thumb = usePdfThumbnail(file);

  return (
    <Card
      shadow="xs"
      radius="md"
      withBorder
      p="xs"
      style={{ width: 225, minWidth: 180, maxWidth: 260, cursor: onDoubleClick ? "pointer" : undefined }}
      onDoubleClick={onDoubleClick}
    >
      <Stack gap={6} align="center">
        <Box
          style={{
            border: "2px solid #e0e0e0",
            borderRadius: 8,
            width: 90,
            height: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto",
            background: "#fafbfc",
          }}
        >
          {thumb ? (
            <Image src={thumb} alt="PDF thumbnail" height={110} width={80} fit="contain" radius="sm" />
          ) : (
            <ThemeIcon
              variant="light"
              color="red"
              size={60}
              radius="sm"
              style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <PictureAsPdfIcon style={{ fontSize: 40 }} />
            </ThemeIcon>
          )}
        </Box>
        <Text fw={500} size="sm" lineClamp={1} ta="center">
          {file.name}
        </Text>
        <Group gap="xs" justify="center">
          <Badge color="gray" variant="light" size="sm">
            {getFileSize(file)}
          </Badge>
          <Badge color="blue" variant="light" size="sm">
            {getFileDate(file)}
          </Badge>
        </Group>
        <Button
          color="red"
          size="xs"
          variant="light"
          onClick={onRemove}
          mt={4}
        >
          Remove
        </Button>
      </Stack>
    </Card>
  );
}

interface FileManagerProps {
  files: FileWithUrl[];
  setFiles: React.Dispatch<React.SetStateAction<FileWithUrl[]>>;
  allowMultiple?: boolean;
  setPdfFile?: (fileObj: { file: File; url: string }) => void;
  setCurrentView?: (view: string) => void;
}

const FileManager: React.FC<FileManagerProps> = ({
  files = [],
  setFiles,
  allowMultiple = true,
  setPdfFile,
  setCurrentView,
}) => {
  const handleDrop = (uploadedFiles: File[]) => {
    setFiles((prevFiles) => (allowMultiple ? [...prevFiles, ...uploadedFiles] : uploadedFiles));
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prevFiles) => prevFiles.filter((_, i) => i !== index));
  };

  return (
    <div style={{ width: "100%", margin: "0 auto", justifyContent: "center", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px" }}>
      <Dropzone
        onDrop={handleDrop}
        accept={[MIME_TYPES.pdf]}
        multiple={allowMultiple}
        maxSize={20 * 1024 * 1024}
        style={{
          marginTop: 16,
          marginBottom: 16,
          border: "2px dashed rgb(202, 202, 202)",
          borderRadius: 8,
          minHeight: 120,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width:"90%"
        }}
      >
        <Group justify="center" gap="xl" style={{ pointerEvents: "none" }}>
          <Text size="md">
            Drag PDF files here or click to select
          </Text>
        </Group>
      </Dropzone>
      {files.length === 0 ? (
        <Text c="dimmed" ta="center">
          No files uploaded yet.
        </Text>
      ) : (
        <Box>
          <Flex
            wrap="wrap"
            gap="lg"
            justify="flex-start"
            style={{ width: "fit-content", margin: "0 auto" }}
          >
            {files.map((file, idx) => (
              <FileCard
                key={file.name + idx}
                file={file}
                onRemove={() => handleRemoveFile(idx)}
                onDoubleClick={() => {
                  const fileObj = (file as FileWithUrl).file || file;
                  setPdfFile &&
                    setPdfFile({
                      file: fileObj,
                      url: URL.createObjectURL(fileObj),
                    });
                  setCurrentView && setCurrentView("viewer");
                }}
              />
            ))}
          </Flex>
        </Box>
      )}
    </div>
  );
};

export default FileManager;
