import React, { useState } from "react";
import axios from "axios";
import {
  Button,
  Select,
  TextInput,
  Checkbox,
  Notification,
  Stack,
  Loader,
  Alert,
  Text,
} from "@mantine/core";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DownloadIcon from "@mui/icons-material/Download";
import { FileWithUrl } from "../types/file";
import { fileStorage } from "../services/fileStorage";
import { useEndpointEnabled } from "../hooks/useEndpointConfig";

export interface SplitPdfPanelProps {
  file: { file: FileWithUrl; url: string } | null;
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
  updateParams: (newParams: Partial<SplitPdfPanelProps["params"]>) => void;
}

const SplitPdfPanel: React.FC<SplitPdfPanelProps> = ({
  file,
  downloadUrl,
  setDownloadUrl,
  params,
  updateParams,
}) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Map mode to endpoint name for checking
  const getEndpointName = (mode: string) => {
    switch (mode) {
      case "byPages":
        return "split-pages";
      case "bySections":
        return "split-pdf-by-sections";
      case "bySizeOrCount":
        return "split-by-size-or-count";
      case "byChapters":
        return "split-pdf-by-chapters";
      default:
        return "split-pages";
    }
  };


  const {
    mode,
    pages,
    hDiv,
    vDiv,
    merge,
    splitType,
    splitValue,
    bookmarkLevel,
    includeMetadata,
    allowDuplicates,
  } = params;


  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(getEndpointName(mode));
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setStatus(t("noFileSelected"));
      return;
    }

    const formData = new FormData();

    // Handle IndexedDB files
    if (!file.file.id) {
      setStatus(t("noFileSelected"));
      return;
    }
    const storedFile = await fileStorage.getFile(file.file.id);
    if (storedFile) {
      const blob = new Blob([storedFile.data], { type: storedFile.type });
      const actualFile = new File([blob], storedFile.name, {
        type: storedFile.type,
        lastModified: storedFile.lastModified
      });
      formData.append("fileInput", actualFile);
    }

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

    setStatus(t("loading"));
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await axios.post(endpoint, formData, { responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus(t("downloadComplete"));
    } catch (error: any) {
      console.error(error);
      let errorMsg = t("error.pdfPassword", "An error occurred while splitting the PDF.");
      if (error.response?.data && typeof error.response.data === 'string') {
        errorMsg = error.response.data;
      } else if (error.message) {
        errorMsg = error.message;
      }
      setErrorMessage(errorMsg);
      setStatus(t("error._value", "Split failed."));
    } finally {
      setIsLoading(false);
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
      <form onSubmit={handleSubmit} className="app-surface p-app-md rounded-app-md">
        <Stack gap="sm" mb={16}>
          <Select
            label={t("split-by-size-or-count.type.label", "Split Mode")}
            value={mode}
            onChange={(v) => v && updateParams({ mode: v })}
            data={[
              { value: "byPages", label: t("split.header", "Split by Pages") + " (e.g. 1,3,5-10)" },
              { value: "bySections", label: t("split-by-sections.title", "Split by Grid Sections") },
              { value: "bySizeOrCount", label: t("split-by-size-or-count.title", "Split by Size or Count") },
              { value: "byChapters", label: t("splitByChapters.title", "Split by Chapters") },
            ]}
          />

          {mode === "byPages" && (
            <TextInput
              label={t("split.splitPages", "Pages")}
              placeholder={t("pageSelectionPrompt", "e.g. 1,3,5-10")}
              value={pages}
              onChange={(e) => updateParams({ pages: e.target.value })}
            />
          )}

          {mode === "bySections" && (
            <Stack gap="sm">
              <TextInput
                label={t("split-by-sections.horizontal.label", "Horizontal Divisions")}
                type="number"
                min="0"
                max="300"
                value={hDiv}
                onChange={(e) => updateParams({ hDiv: e.target.value })}
                placeholder={t("split-by-sections.horizontal.placeholder", "Enter number of horizontal divisions")}
              />
              <TextInput
                label={t("split-by-sections.vertical.label", "Vertical Divisions")}
                type="number"
                min="0"
                max="300"
                value={vDiv}
                onChange={(e) => updateParams({ vDiv: e.target.value })}
                placeholder={t("split-by-sections.vertical.placeholder", "Enter number of vertical divisions")}
              />
              <Checkbox
                label={t("split-by-sections.merge", "Merge sections into one PDF")}
                checked={merge}
                onChange={(e) => updateParams({ merge: e.currentTarget.checked })}
              />
            </Stack>
          )}

          {mode === "bySizeOrCount" && (
            <Stack gap="sm">
              <Select
                label={t("split-by-size-or-count.type.label", "Split Type")}
                value={splitType}
                onChange={(v) => v && updateParams({ splitType: v })}
                data={[
                  { value: "size", label: t("split-by-size-or-count.type.size", "By Size") },
                  { value: "pages", label: t("split-by-size-or-count.type.pageCount", "By Page Count") },
                  { value: "docs", label: t("split-by-size-or-count.type.docCount", "By Document Count") },
                ]}
              />
              <TextInput
                label={t("split-by-size-or-count.value.label", "Split Value")}
                placeholder={t("split-by-size-or-count.value.placeholder", "e.g. 10MB or 5 pages")}
                value={splitValue}
                onChange={(e) => updateParams({ splitValue: e.target.value })}
              />
            </Stack>
          )}

          {mode === "byChapters" && (
            <Stack gap="sm">
              <TextInput
                label={t("splitByChapters.bookmarkLevel", "Bookmark Level")}
                type="number"
                value={bookmarkLevel}
                onChange={(e) => updateParams({ bookmarkLevel: e.target.value })}
              />
              <Checkbox
                label={t("splitByChapters.includeMetadata", "Include Metadata")}
                checked={includeMetadata}
                onChange={(e) => updateParams({ includeMetadata: e.currentTarget.checked })}
              />
              <Checkbox
                label={t("splitByChapters.allowDuplicates", "Allow Duplicate Bookmarks")}
                checked={allowDuplicates}
                onChange={(e) => updateParams({ allowDuplicates: e.currentTarget.checked })}
              />
            </Stack>
          )}

          <Button type="submit" loading={isLoading} fullWidth>
            {isLoading ? t("loading") : t("split.submit", "Split PDF")}
          </Button>

          {status && <p className="text-xs text-text-muted">{status}</p>}

          {errorMessage && (
            <Notification color="red" title={t("error._value", "Error")} onClose={() => setErrorMessage(null)}>
              {errorMessage}
            </Notification>
          )}

          {status === t("downloadComplete") && downloadUrl && (
            <Button
              component="a"
              href={downloadUrl}
              download="split_output.zip"
              leftSection={<DownloadIcon />}
              color="green"
              fullWidth
            >
              {t("downloadPdf", "Download Split PDF")}
            </Button>
          )}
        </Stack>
      </form>
  );
};

export default SplitPdfPanel;
