import React, { useState } from "react";
import axios from "axios";
import {
  Button,
  Select,
  TextInput,
  Checkbox,
  Notification,
  Stack,
} from "@mantine/core";
import DownloadIcon from "@mui/icons-material/Download";

export interface SplitPdfPanelProps {
  file: { file: File; url: string } | null;
  downloadUrl?: string | null;
  setDownloadUrl: (url: string | null) => void;
  params: {
    mode: string;
    pages: string;
    hDiv: string;
    vDiv: string;
    merge: boolean;
    splitType: string;
    splitValue: string;
    bookmarkLevel: string;
    includeMetadata: boolean;
    allowDuplicates: boolean;
  };
  updateParams: (newParams: Partial<SplitPdfPanelProps['params']>) => void;
}

const SplitPdfPanel: React.FC<SplitPdfPanelProps> = ({
  file,
  downloadUrl,
  setDownloadUrl,
  params,
  updateParams,
}) => {
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    mode, pages, hDiv, vDiv, merge,
    splitType, splitValue, bookmarkLevel,
    includeMetadata, allowDuplicates
  } = params;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setStatus("Please upload a PDF first.");
      return;
    }

    const formData = new FormData();
    formData.append("fileInput", file.file);

    let endpoint = "";

    switch (mode) {
      case "byPages":
        formData.append("pageNumbers", pages);
        endpoint = "/api/v1/general/split-pages";
        break;
      case "bySections":
        formData.append("horizontalDivisions", hDiv);
        formData.append("verticalDivisions", vDiv);
        formData.append("merge", merge.toString());
        endpoint = "/api/v1/general/split-pdf-by-sections";
        break;
      case "bySizeOrCount":
        formData.append(
          "splitType",
          splitType === "size" ? "0" : splitType === "pages" ? "1" : "2"
        );
        formData.append("splitValue", splitValue);
        endpoint = "/api/v1/general/split-by-size-or-count";
        break;
      case "byChapters":
        formData.append("bookmarkLevel", bookmarkLevel);
        formData.append("includeMetadata", includeMetadata.toString());
        formData.append("allowDuplicates", allowDuplicates.toString());
        endpoint = "/api/v1/general/split-pdf-by-chapters";
        break;
      default:
        return;
    }

    setStatus("Processing split...");
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await axios.post(endpoint, formData, { responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus("Download ready.");
    } catch (error: any) {
      console.error(error);
      setErrorMessage(
        error.response?.data || "An error occurred while splitting the PDF."
      );
      setStatus("Split failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="sm" mb={16}>
        <Select
          label="Split Mode"
          value={mode}
          onChange={(v) => v && updateParams({ mode: v })}
          data={[
            { value: "byPages", label: "Split by Pages (e.g. 1,3,5-10)" },
            { value: "bySections", label: "Split by Grid Sections" },
            { value: "bySizeOrCount", label: "Split by Size or Count" },
            { value: "byChapters", label: "Split by Chapters" },
          ]}
        />

        {mode === "byPages" && (
          <TextInput
            label="Pages"
            placeholder="e.g. 1,3,5-10"
            value={pages}
            onChange={(e) => updateParams({ pages: e.target.value })}
          />
        )}

        {mode === "bySections" && (
          <Stack gap="sm">
            <TextInput
              label="Horizontal Divisions"
              type="number"
              min="0"
              max="300"
              value={hDiv}
              onChange={(e) => updateParams({ hDiv: e.target.value })}
            />
            <TextInput
              label="Vertical Divisions"
              type="number"
              min="0"
              max="300"
              value={vDiv}
              onChange={(e) => updateParams({ vDiv: e.target.value })}
            />
            <Checkbox
              label="Merge sections into one PDF"
              checked={merge}
              onChange={(e) => updateParams({ merge: e.currentTarget.checked })}
            />
          </Stack>
        )}

        {mode === "bySizeOrCount" && (
          <Stack gap="sm">
            <Select
              label="Split Type"
              value={splitType}
              onChange={(v) => v && updateParams({ splitType: v })}
              data={[
                { value: "size", label: "By Size" },
                { value: "pages", label: "By Page Count" },
                { value: "docs", label: "By Document Count" },
              ]}
            />
            <TextInput
              label="Split Value"
              placeholder="e.g. 10MB or 5 pages"
              value={splitValue}
              onChange={(e) => updateParams({ splitValue: e.target.value })}
            />
          </Stack>
        )}

        {mode === "byChapters" && (
          <Stack gap="sm">
            <TextInput
              label="Bookmark Level"
              type="number"
              value={bookmarkLevel}
              onChange={(e) => updateParams({ bookmarkLevel: e.target.value })}
            />
            <Checkbox
              label="Include Metadata"
              checked={includeMetadata}
              onChange={(e) => updateParams({ includeMetadata: e.currentTarget.checked })}
            />
            <Checkbox
              label="Allow Duplicate Bookmarks"
              checked={allowDuplicates}
              onChange={(e) => updateParams({ allowDuplicates: e.currentTarget.checked })}
            />
          </Stack>
        )}

        <Button type="submit" loading={isLoading} fullWidth>
          {isLoading ? "Processing..." : "Split PDF"}
        </Button>

        {status && <p className="text-xs text-gray-600">{status}</p>}

        {errorMessage && (
          <Notification color="red" title="Error" onClose={() => setErrorMessage(null)}>
            {errorMessage}
          </Notification>
        )}

        {status === "Download ready." && downloadUrl && (
          <Button
            component="a"
            href={downloadUrl}
            download="split_output.zip"
            leftSection={<DownloadIcon />}
            color="green"
            fullWidth
          >
            Download Split PDF
          </Button>
        )}
      </Stack>
    </form>
  );
};

export default SplitPdfPanel;
