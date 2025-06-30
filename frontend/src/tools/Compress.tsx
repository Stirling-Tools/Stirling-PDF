import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Slider, Group, Text, Button, Checkbox, TextInput, Loader, Alert } from "@mantine/core";
import { FileWithUrl } from "../types/file";
import { fileStorage } from "../services/fileStorage";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";

export interface CompressProps {
  files?: FileWithUrl[];
  setDownloadUrl?: (url: string) => void;
  setLoading?: (loading: boolean) => void;
  params?: {
    compressionLevel: number;
    grayscale: boolean;
    removeMetadata: boolean;
    expectedSize: string;
    aggressive: boolean;
  };
  updateParams?: (newParams: Partial<CompressProps["params"]>) => void;
}

const CompressPdfPanel: React.FC<CompressProps> = ({
  files = [],
  setDownloadUrl,
  setLoading,
  params = {
    compressionLevel: 5,
    grayscale: false,
    removeMetadata: false,
    expectedSize: "",
    aggressive: false,
  },
  updateParams,
}) => {
  const { t } = useTranslation();

  const [selected, setSelected] = useState<boolean[]>(files.map(() => false));
  const [localLoading, setLocalLoading] = useState<boolean>(false);
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled("compress-pdf");

  const {
    compressionLevel,
    grayscale,
    removeMetadata,
    expectedSize,
    aggressive,
  } = params;

  // Update selection state if files prop changes
  React.useEffect(() => {
    setSelected(files.map(() => false));
  }, [files]);

  const handleCheckbox = (idx: number) => {
    setSelected(sel => sel.map((v, i) => (i === idx ? !v : v)));
  };

  const handleCompress = async () => {
    const selectedFiles = files.filter((_, i) => selected[i]);
    if (selectedFiles.length === 0) return;
    setLocalLoading(true);
    setLoading?.(true);

    try {
      const formData = new FormData();

      // Handle IndexedDB files
      for (const file of selectedFiles) {
              if (!file.id) {
        continue; // Skip files without an id
      }
        const storedFile = await fileStorage.getFile(file.id);
        if (storedFile) {
          const blob = new Blob([storedFile.data], { type: storedFile.type });
          const actualFile = new File([blob], storedFile.name, {
            type: storedFile.type,
            lastModified: storedFile.lastModified
          });
          formData.append("fileInput", actualFile);
        }
      }

      formData.append("compressionLevel", compressionLevel.toString());
      formData.append("grayscale", grayscale.toString());
      formData.append("removeMetadata", removeMetadata.toString());
      formData.append("aggressive", aggressive.toString());
      if (expectedSize) formData.append("expectedSize", expectedSize);

      const res = await fetch("/api/v1/general/compress-pdf", {
        method: "POST",
        body: formData,
      });
      const blob = await res.blob();
      setDownloadUrl?.(URL.createObjectURL(blob));
    } catch (error) {
      console.error('Compression failed:', error);
    } finally {
      setLocalLoading(false);
      setLoading?.(false);
    }
  };

  if (endpointLoading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="md" />
        <Text size="sm" c="dimmed">{t("loading", "Loading...")}</Text>
      </Stack>
    );
  }

  if (endpointEnabled === false) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Alert color="red" title={t("error._value", "Error")} variant="light">
          {t("endpointDisabled", "This feature is currently disabled.")}
        </Alert>
      </Stack>
    );
  }

  return (
      <Stack>
        <Text fw={500} mb={4}>{t("multiPdfDropPrompt", "Select files to compress:")}</Text>
        <Stack gap={4}>
          {files.length === 0 && <Text c="dimmed" size="sm">{t("noFileSelected")}</Text>}
          {files.map((file, idx) => (
            <Checkbox
              key={file.name + idx}
              label={file.name}
              checked={selected[idx] || false}
              onChange={() => handleCheckbox(idx)}
            />
          ))}
        </Stack>
        <Stack gap={4} mb={14}>
          <Text size="sm" style={{ minWidth: 140 }}>{t("compress.selectText.2", "Compression Level")}</Text>
          <Slider
            min={1}
            max={9}
            step={1}
            value={compressionLevel}
            onChange={(value) => updateParams?.({ compressionLevel: value })}
            marks={[
              { value: 1, label: "1" },
              { value: 5, label: "5" },
              { value: 9, label: "9" },
            ]}
            style={{ flex: 1 }}
          />
        </Stack>
        <Checkbox
          label={t("compress.grayscale.label", "Convert images to grayscale")}
          checked={grayscale}
          onChange={e => updateParams?.({ grayscale: e.currentTarget.checked })}
        />
        <Checkbox
          label={t("removeMetadata.submit", "Remove PDF metadata")}
          checked={removeMetadata}
          onChange={e => updateParams?.({ removeMetadata: e.currentTarget.checked })}
        />
        <Checkbox
          label={t("compress.selectText.1.1", "Aggressive compression (may reduce quality)")}
          checked={aggressive}
          onChange={e => updateParams?.({ aggressive: e.currentTarget.checked })}
        />
        <TextInput
          label={t("compress.selectText.5", "Expected output size")}
          placeholder={t("compress.selectText.5", "e.g. 25MB, 10.8MB, 25KB")}
          value={expectedSize}
          onChange={e => updateParams?.({ expectedSize: e.currentTarget.value })}
        />
        <Button
          onClick={handleCompress}
          loading={localLoading}
          disabled={selected.every(v => !v)}
          fullWidth
          mt="md"
        >
          {t("compress.submit", "Compress")} {t("pdfPrompt", "PDF")}{selected.filter(Boolean).length > 1 ? "s" : ""}
        </Button>
      </Stack>
  );
};

export default CompressPdfPanel;
