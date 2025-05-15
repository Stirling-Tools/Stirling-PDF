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

export default function SplitPdfPanel({ file, downloadUrl, setDownloadUrl }) {
  const [mode, setMode] = useState("byPages");
  const [pageNumbers, setPageNumbers] = useState("");

  const [horizontalDivisions, setHorizontalDivisions] = useState("0");
  const [verticalDivisions, setVerticalDivisions] = useState("1");
  const [mergeSections, setMergeSections] = useState(false);

  const [splitType, setSplitType] = useState("size");
  const [splitValue, setSplitValue] = useState("");

  const [bookmarkLevel, setBookmarkLevel] = useState("0");
  const [includeMetadata, setIncludeMetadata] = useState(false);
  const [allowDuplicates, setAllowDuplicates] = useState(false);

  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleSubmit = async (e) => {
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
        formData.append("pageNumbers", pageNumbers);
        endpoint = "/api/v1/general/split-pages";
        break;
      case "bySections":
        formData.append("horizontalDivisions", horizontalDivisions);
        formData.append("verticalDivisions", verticalDivisions);
        formData.append("merge", mergeSections);
        endpoint = "/api/v1/general/split-pdf-by-sections";
        break;
      case "bySizeOrCount":
        formData.append("splitType", splitType === "size" ? 0 : splitType === "pages" ? 1 : 2);
        formData.append("splitValue", splitValue);
        endpoint = "/api/v1/general/split-by-size-or-count";
        break;
      case "byChapters":
        formData.append("bookmarkLevel", bookmarkLevel);
        formData.append("includeMetadata", includeMetadata);
        formData.append("allowDuplicates", allowDuplicates);
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
    } catch (error) {
      console.error(error);
      setErrorMessage(error.response?.data || "An error occurred while splitting the PDF.");
      setStatus("Split failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} >
      <h3 className="font-semibold">Split PDF</h3>

      <Select
        label="Split Mode"
        value={mode}
        onChange={setMode}
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
          value={pageNumbers}
          onChange={(e) => setPageNumbers(e.target.value)}
        />
      )}

      {mode === "bySections" && (
        <Stack spacing="sm">
          <TextInput
            label="Horizontal Divisions"
            type="number"
            min="0"
            max="300"
            value={horizontalDivisions}
            onChange={(e) => setHorizontalDivisions(e.target.value)}
          />
          <TextInput
            label="Vertical Divisions"
            type="number"
            min="0"
            max="300"
            value={verticalDivisions}
            onChange={(e) => setVerticalDivisions(e.target.value)}
          />
          <Checkbox
            label="Merge sections into one PDF"
            checked={mergeSections}
            onChange={(e) => setMergeSections(e.currentTarget.checked)}
          />
        </Stack>
      )}

      {mode === "bySizeOrCount" && (
        <Stack spacing="sm">
          <Select
            label="Split Type"
            value={splitType}
            onChange={setSplitType}
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
            onChange={(e) => setSplitValue(e.target.value)}
          />
        </Stack>
      )}

      {mode === "byChapters" && (
        <Stack spacing="sm">
          <TextInput
            label="Bookmark Level"
            type="number"
            value={bookmarkLevel}
            onChange={(e) => setBookmarkLevel(e.target.value)}
          />
          <Checkbox
            label="Include Metadata"
            checked={includeMetadata}
            onChange={(e) => setIncludeMetadata(e.currentTarget.checked)}
          />
          <Checkbox
            label="Allow Duplicate Bookmarks"
            checked={allowDuplicates}
            onChange={(e) => setAllowDuplicates(e.currentTarget.checked)}
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
          leftIcon={<DownloadIcon />}
          color="green"
          fullWidth
        >
          Download Split PDF
        </Button>
      )}
    </form>
  );
}
