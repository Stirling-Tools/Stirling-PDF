import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Stack, Slider, Group, Text, Button, Checkbox, TextInput, Paper } from "@mantine/core";

export interface CompressProps {
  files?: File[];
  setDownloadUrl?: (url: string) => void;
  setLoading?: (loading: boolean) => void;
}

const CompressPdfPanel: React.FC<CompressProps> = ({
  files = [],
  setDownloadUrl,
  setLoading,
}) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();


  const [selected, setSelected] = useState<boolean[]>(files.map(() => false));
  const [compressionLevel, setCompressionLevel] = useState<number>(5);
  const [grayscale, setGrayscale] = useState<boolean>(false);
  const [removeMetadata, setRemoveMetadata] = useState<boolean>(false);
  const [expectedSize, setExpectedSize] = useState<string>("");
  const [aggressive, setAggressive] = useState<boolean>(false);
  const [localLoading, setLocalLoading] = useState<boolean>(false);

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

    const formData = new FormData();
    selectedFiles.forEach(file => formData.append("fileInput", file));
    formData.append("compressionLevel", compressionLevel.toString());
    formData.append("grayscale", grayscale.toString());
    formData.append("removeMetadata", removeMetadata.toString());
    formData.append("aggressive", aggressive.toString());
    if (expectedSize) formData.append("expectedSize", expectedSize);

    try {
      const res = await fetch("/api/v1/general/compress-pdf", {
        method: "POST",
        body: formData,
      });
      const blob = await res.blob();
      setDownloadUrl?.(URL.createObjectURL(blob));
    } finally {
      setLocalLoading(false);
      setLoading?.(false);
    }
  };


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
            onChange={setCompressionLevel}
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
          onChange={e => setGrayscale(e.currentTarget.checked)}
        />
        <Checkbox
          label={t("removeMetadata.submit", "Remove PDF metadata")}
          checked={removeMetadata}
          onChange={e => setRemoveMetadata(e.currentTarget.checked)}
        />
        <Checkbox
          label={t("compress.selectText.1.1", "Aggressive compression (may reduce quality)")}
          checked={aggressive}
          onChange={e => setAggressive(e.currentTarget.checked)}
        />
        <TextInput
          label={t("compress.selectText.5", "Expected output size")}
          placeholder={t("compress.selectText.5", "e.g. 25MB, 10.8MB, 25KB")}
          value={expectedSize}
          onChange={e => setExpectedSize(e.currentTarget.value)}
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
