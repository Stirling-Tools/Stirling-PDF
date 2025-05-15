import React, { useState } from "react";
import { Stack, Slider, Group, Text, Button, Checkbox, TextInput, Paper } from "@mantine/core";

export default function CompressPdfPanel({ files = [], setDownloadUrl, setLoading }) {
  const [selected, setSelected] = useState(files.map(() => false));
  const [compressionLevel, setCompressionLevel] = useState(5); // 1-9, default 5
  const [grayscale, setGrayscale] = useState(false);
  const [removeMetadata, setRemoveMetadata] = useState(false);
  const [expectedSize, setExpectedSize] = useState("");
  const [aggressive, setAggressive] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);

  // Update selection state if files prop changes
  React.useEffect(() => {
    setSelected(files.map(() => false));
  }, [files]);

  const handleCheckbox = idx => {
    setSelected(sel => sel.map((v, i) => (i === idx ? !v : v)));
  };

  const handleCompress = async () => {
    const selectedFiles = files.filter((_, i) => selected[i]);
    if (selectedFiles.length === 0) return;
    setLocalLoading(true);
    setLoading?.(true);

    const formData = new FormData();
    selectedFiles.forEach(file => formData.append("fileInput", file));
    formData.append("compressionLevel", compressionLevel);
    formData.append("grayscale", grayscale);
    formData.append("removeMetadata", removeMetadata);
    formData.append("aggressive", aggressive);
    if (expectedSize) formData.append("expectedSize", expectedSize);

    try {
      const res = await fetch("/api/v1/general/compress-pdf", {
        method: "POST",
        body: formData,
      });
      const blob = await res.blob();
      setDownloadUrl(URL.createObjectURL(blob));
    } finally {
      setLocalLoading(false);
      setLoading?.(false);
    }
  };

  return (
    <Paper shadow="xs" p="md" radius="md" withBorder>
      <Stack>
        <Text weight={500} mb={4}>Select files to compress:</Text>
        <Stack spacing={4}>
          {files.length === 0 && <Text color="dimmed" size="sm">No files loaded.</Text>}
          {files.map((file, idx) => (
            <Checkbox
              key={file.name + idx}
              label={file.name}
              checked={selected[idx] || false}
              onChange={() => handleCheckbox(idx)}
            />
          ))}
        </Stack>
        <Stack spacing={4} mb={14}>
          <Text size="sm" style={{ minWidth: 140 }}>Compression Level</Text>
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
        </Stack >
        <Checkbox
          label="Convert images to grayscale"
          checked={grayscale}
          onChange={e => setGrayscale(e.currentTarget.checked)}
        />
        <Checkbox
          label="Remove PDF metadata"
          checked={removeMetadata}
          onChange={e => setRemoveMetadata(e.currentTarget.checked)}
        />
        <Checkbox
          label="Aggressive compression (may reduce quality)"
          checked={aggressive}
          onChange={e => setAggressive(e.currentTarget.checked)}
        />
        <TextInput
          label="Expected output size (e.g. 2MB, 500KB)"
          placeholder="Optional"
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
          Compress Selected PDF{selected.filter(Boolean).length > 1 ? "s" : ""}
        </Button>
      </Stack>
    </Paper>
  );
}
