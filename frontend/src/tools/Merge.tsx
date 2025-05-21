import React, { useState, useEffect } from "react";
import { Paper, Button, Checkbox, Stack, Text, Group, Loader, Alert } from "@mantine/core";

export interface MergePdfPanelProps {
  files: File[];
  setDownloadUrl: (url: string) => void;
}

const MergePdfPanel: React.FC<MergePdfPanelProps> = ({ files, setDownloadUrl }) => {
  const [selectedFiles, setSelectedFiles] = useState<boolean[]>([]);
  const [downloadUrl, setLocalDownloadUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedFiles(files.map(() => true));
  }, [files]);

  const handleMerge = async () => {
    const filesToMerge = files.filter((_, index) => selectedFiles[index]);
    if (filesToMerge.length < 2) {
      setErrorMessage("Please select at least two PDFs to merge.");
      return;
    }

    const formData = new FormData();
    filesToMerge.forEach((file) => formData.append("fileInput", file));

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/v1/general/merge-pdfs", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to merge PDFs: ${errorText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setLocalDownloadUrl(url);
    } catch (error: any) {
      setErrorMessage(error.message || "Unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckboxChange = (index: number) => {
    setSelectedFiles((prev) =>
      prev.map((selected, i) => (i === index ? !selected : selected))
    );
  };

  const selectedCount = selectedFiles.filter(Boolean).length;

  return (
    <Paper shadow="xs" radius="md" p="md" withBorder>
      <Stack>
        <Text fw={500} size="lg">Merge PDFs</Text>
        <Stack gap={4}>
          {files.map((file, index) => (
            <Group key={index} gap="xs">
              <Checkbox
                checked={selectedFiles[index] || false}
                onChange={() => handleCheckboxChange(index)}
              />
              <Text size="sm">{file.name}</Text>
            </Group>
          ))}
        </Stack>
        {selectedCount < 2 && (
          <Text size="sm" c="red">
            Please select at least two PDFs to merge.
          </Text>
        )}
        <Button
          onClick={handleMerge}
          loading={isLoading}
          disabled={selectedCount < 2 || isLoading}
          mt="md"
        >
          Merge PDFs
        </Button>
        {errorMessage && (
          <Alert color="red" mt="sm">
            {errorMessage}
          </Alert>
        )}
        {downloadUrl && (
          <Button
            component="a"
            href={downloadUrl}
            download="merged.pdf"
            color="green"
            variant="light"
            mt="md"
          >
            Download Merged PDF
          </Button>
        )}
      </Stack>
    </Paper>
  );
};

export default MergePdfPanel;
