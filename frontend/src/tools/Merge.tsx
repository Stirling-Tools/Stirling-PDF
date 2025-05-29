import React, { useState, useEffect } from "react";
import { Paper, Button, Checkbox, Stack, Text, Group, Loader, Alert } from "@mantine/core";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

export interface MergePdfPanelProps {
  files: File[];
  setDownloadUrl: (url: string) => void;
  params: {
    order: string;
    removeDuplicates: boolean;
  };
  updateParams: (newParams: Partial<MergePdfPanelProps["params"]>) => void;
}

const MergePdfPanel: React.FC<MergePdfPanelProps> = ({
  files,
  setDownloadUrl,
  params,
  updateParams,
}) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
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
      setErrorMessage(t("multiPdfPrompt")); // "Select PDFs (2+)"
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

  const { order, removeDuplicates } = params;

  return (
      <Stack>
        <Text fw={500} size="lg">{t("merge.header")}</Text>
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
            {t("multiPdfPrompt")}
          </Text>
        )}
        <Button
          onClick={handleMerge}
          loading={isLoading}
          disabled={selectedCount < 2 || isLoading}
          mt="md"
        >
{t("merge.submit")}
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
{t("downloadPdf")}
          </Button>
        )}
        <Checkbox
          label={t("merge.removeCertSign")}
          checked={removeDuplicates}
          onChange={() => updateParams({ removeDuplicates: !removeDuplicates })}
        />
      </Stack>
  );
};

export default MergePdfPanel;
