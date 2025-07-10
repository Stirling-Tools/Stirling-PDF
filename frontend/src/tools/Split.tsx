import React, { useState } from "react";
import axios from "axios";
import {
  Button,
  Select,
  TextInput,
  Checkbox,
  Notification,
  Stack,
  Paper,
  Text,
  Alert,
  Box,
  Group,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import DownloadIcon from "@mui/icons-material/Download";
import { useFileContext } from "../contexts/FileContext";
import FileEditor from "../components/fileEditor/FileEditor";

export interface SplitPdfPanelProps {
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
  selectedFiles?: File[];
}

const SplitPdfPanel: React.FC<SplitPdfPanelProps> = ({
  params,
  updateParams,
  selectedFiles = [],
}) => {
  const { t } = useTranslation();
  const fileContext = useFileContext();
  const { activeFiles, selectedFileIds, updateProcessedFile } = fileContext;

  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

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

  // Clear download when parameters or files change
  React.useEffect(() => {
    if (downloadUrl) {
      setDownloadUrl(null);
      setStatus("");
    }
    // Reset step 2 completion when parameters change (but not when just status/loading changes)
    setStep2Completed(false);
  }, [mode, pages, hDiv, vDiv, merge, splitType, splitValue, bookmarkLevel, includeMetadata, allowDuplicates, selectedFiles]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setStatus(t("noFileSelected"));
      return;
    }

    const formData = new FormData();

    // Use selected files from context
    selectedFiles.forEach(file => {
      formData.append("fileInput", file);
    });

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

  // Check if current mode needs additional parameters
  const modeNeedsParams = (currentMode: string) => {
    return currentMode && currentMode !== ""; // All modes need some params
  };

  // Step 2 completion state
  const [step2Completed, setStep2Completed] = useState(false);

  // Check if step 2 settings are valid (for enabling Done button)
  const step2SettingsValid = (() => {
    if (!mode) return false;
    
    switch (mode) {
      case "byPages":
        return pages.trim() !== "";
      case "bySections":
        return hDiv !== "" && vDiv !== "";
      case "bySizeOrCount":
        return splitType !== "" && splitValue.trim() !== "";
      case "byChapters":
        return bookmarkLevel !== "";
      default:
        return false;
    }
  })();

  // Determine what steps to show
  const showStep1 = true; // Always show - Files
  const showStep2 = selectedFiles.length > 0; // Settings (mode + params)
  const showStep3 = step2Completed; // Review (apply & continue vs export)

  // Determine if steps are collapsed (completed)
  const step1Collapsed = selectedFiles.length > 0;
  const step2Collapsed = step2Completed;

  return (
    <Box h="100%" p="md" style={{ overflow: 'auto' }}>
      <Stack gap="md">
        {/* Step 1: Files */}
        {showStep1 && (
          <Paper p="md" withBorder>
            <Text fw={500} size="lg" mb="sm">1. Files</Text>
            {step1Collapsed ? (
              <Text size="sm" c="green">
                ✓ Selected: {selectedFiles[0]?.name}
              </Text>
            ) : (
              <Text size="sm" c="dimmed">
                Select a PDF file in the main view to get started
              </Text>
            )}
          </Paper>
        )}

        {/* Step 2: Settings */}
        {showStep2 && (
          <Paper 
            p="md" 
            withBorder
            style={{ 
              cursor: step2Collapsed ? 'pointer' : 'default',
              opacity: step2Collapsed ? 0.8 : 1,
              transition: 'opacity 0.2s ease'
            }}
            onClick={step2Collapsed ? () => {
              // Go back to step 2
              setStep2Completed(false);
            } : undefined}
          >
            <Text fw={500} size="lg" mb="sm">2. Settings</Text>
            {step2Collapsed ? (
              <Text size="sm" c="green">
                ✓ Settings configured <Text span c="dimmed" size="xs">(click to change)</Text>
              </Text>
            ) : (
              <Stack gap="md">
                <Select
                  label="Choose split method"
                  placeholder="Select how to split the PDF"
                  value={mode}
                  onChange={(v) => v && updateParams({ mode: v })}
                  data={[
                    { value: "byPages", label: t("split.header", "Split by Pages") + " (e.g. 1,3,5-10)" },
                    { value: "bySections", label: t("split-by-sections.title", "Split by Grid Sections") },
                    { value: "bySizeOrCount", label: t("split-by-size-or-count.title", "Split by Size or Count") },
                    { value: "byChapters", label: t("splitByChapters.title", "Split by Chapters") },
                  ]}
                />

                {/* Mode-specific Parameters */}
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

                {/* Done Button */}
                {mode && (
                  <Button 
                    fullWidth
                    mt="md"
                    disabled={!step2SettingsValid}
                    onClick={() => setStep2Completed(true)}
                  >
                    Done
                  </Button>
                )}
              </Stack>
            )}
          </Paper>
        )}

        {/* Step 3: Review */}
        {showStep3 && (
          <Paper p="md" withBorder>
            <Text fw={500} size="lg" mb="sm">3. Review</Text>
            
            <form onSubmit={handleSubmit}>
              <Button 
                type="submit"
                loading={isLoading}
                fullWidth
                disabled={selectedFiles.length === 0}
              >
                {isLoading ? t("loading") : t("split.submit", "Split PDF")}
              </Button>

              {status && <Text size="xs" c="dimmed" mt="xs">{status}</Text>}

              {errorMessage && (
                <Notification color="red" title={t("error._value", "Error")} onClose={() => setErrorMessage(null)} mt="sm">
                  {errorMessage}
                </Notification>
              )}

              {downloadUrl && (
                <Button
                  component="a"
                  href={downloadUrl}
                  download="split_output.zip"
                  leftSection={<DownloadIcon />}
                  color="green"
                  fullWidth
                  mt="sm"
                >
                  {t("downloadPdf", "Download Split PDF")}
                </Button>
              )}
            </form>
          </Paper>
        )}
      </Stack>
    </Box>
  );
};

export default SplitPdfPanel;
