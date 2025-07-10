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
  Grid,
  Image,
  Loader,
  Center,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import DownloadIcon from "@mui/icons-material/Download";
import { useFileContext } from "../contexts/FileContext";
import { FileOperation } from "../types/fileContext";
import { zipFileService } from "../services/zipFileService";
import { generateThumbnailForFile } from "../utils/thumbnailUtils";
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
  onPreviewFile?: (file: File | null) => void;
}

const SplitPdfPanel: React.FC<SplitPdfPanelProps> = ({
  params,
  updateParams,
  selectedFiles = [],
  onPreviewFile,
}) => {
  const { t } = useTranslation();
  const fileContext = useFileContext();
  const { activeFiles, selectedFileIds, updateProcessedFile, recordOperation, markOperationApplied, markOperationFailed, setCurrentMode } = fileContext;

  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [splitResults, setSplitResults] = useState<{
    files: File[];
    thumbnails: string[];
    isGeneratingThumbnails: boolean;
  }>({
    files: [],
    thumbnails: [],
    isGeneratingThumbnails: false
  });
  const [previewFile, setPreviewFile] = useState<File | null>(null);

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
    // Clear split results and preview file
    setSplitResults({
      files: [],
      thumbnails: [],
      isGeneratingThumbnails: false
    });
    setPreviewFile(null);
    onPreviewFile?.(null);
    // Parameters changed - results will be cleared automatically
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

    // Record the operation before starting
    const operationId = `split-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileId = selectedFiles[0].name; // Use first file's name as primary ID

    const operation: FileOperation = {
      id: operationId,
      type: 'split',
      timestamp: Date.now(),
      fileIds: selectedFiles.map(f => f.name),
      status: 'pending',
      metadata: {
        originalFileName: selectedFiles[0].name,
        parameters: {
          mode,
          pages: mode === 'byPages' ? pages : undefined,
          hDiv: mode === 'bySections' ? hDiv : undefined,
          vDiv: mode === 'bySections' ? vDiv : undefined,
          merge: mode === 'bySections' ? merge : undefined,
          splitType: mode === 'bySizeOrCount' ? splitType : undefined,
          splitValue: mode === 'bySizeOrCount' ? splitValue : undefined,
          bookmarkLevel: mode === 'byChapters' ? bookmarkLevel : undefined,
          includeMetadata: mode === 'byChapters' ? includeMetadata : undefined,
          allowDuplicates: mode === 'byChapters' ? allowDuplicates : undefined,
        },
        fileSize: selectedFiles[0].size
      }
    };

    recordOperation(fileId, operation);

    setStatus(t("loading"));
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await axios.post(endpoint, formData, { responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus(t("downloadComplete"));

      // Extract files from ZIP response for preview
      try {
        // Create a File object from the blob to use with zipFileService
        const zipFile = new File([blob], "split_result.zip", { type: "application/zip" });

        // Extract PDF files for preview
        const extractionResult = await zipFileService.extractPdfFiles(zipFile);

        if (extractionResult.success && extractionResult.extractedFiles.length > 0) {
          setSplitResults(prev => ({
            ...prev,
            files: extractionResult.extractedFiles,
            isGeneratingThumbnails: true
          }));

          // Generate thumbnails for preview
          const thumbnails = await Promise.all(
            extractionResult.extractedFiles.map(async (file) => {
              try {
                return await generateThumbnailForFile(file);
              } catch (error) {
                console.warn(`Failed to generate thumbnail for ${file.name}:`, error);
                return ''; // Empty string for failed thumbnails
              }
            })
          );

          setSplitResults(prev => ({
            ...prev,
            thumbnails,
            isGeneratingThumbnails: false
          }));
        }
      } catch (extractError) {
        console.warn('Failed to extract files for preview:', extractError);
        // Don't fail the whole operation just because preview extraction failed
      }

      // Mark operation as applied on success
      markOperationApplied(fileId, operationId);
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

      // Mark operation as failed
      markOperationFailed(fileId, operationId, errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if current mode needs additional parameters
  const modeNeedsParams = (currentMode: string) => {
    return currentMode && currentMode !== ""; // All modes need some params
  };

  // Handle thumbnail click to open in viewer
  const handleThumbnailClick = (file: File) => {
    try {
      // Set as preview file (no context pollution)
      setPreviewFile(file);
      onPreviewFile?.(file);

      // Store that we came from Split tool for return navigation
      sessionStorage.setItem('previousMode', 'split');

      // Switch to viewer mode
      setCurrentMode('viewer');
    } catch (error) {
      console.error('Failed to open file in viewer:', error);
    }
  };

  // No longer needed - step completion is determined by split results

  // Check if step 2 settings are valid (for enabling Split button)
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
  const showStep3 = downloadUrl !== null; // Review (show results after split)

  // Determine if steps are collapsed (completed)
  const step1Collapsed = selectedFiles.length > 0;
  const step2Collapsed = downloadUrl !== null;

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
              // Reset to allow changing settings
              setDownloadUrl(null);
              setSplitResults({
                files: [],
                thumbnails: [],
                isGeneratingThumbnails: false
              });
              setStatus("");
              setErrorMessage(null);
              // Clear any active preview and return to previous view
              setPreviewFile(null);
              onPreviewFile?.(null);
              // Return to the Split tool view
              setCurrentMode('split');
            } : undefined}
          >
            <Text fw={500} size="lg" mb="sm">2. Settings</Text>
            {step2Collapsed ? (
              <Text size="sm" c="green">
                ✓ Split completed <Text span c="dimmed" size="xs">(click to change settings)</Text>
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

                {/* Split Button */}
                {mode && (
                  <form onSubmit={handleSubmit}>
                    <Button
                      type="submit"
                      fullWidth
                      mt="md"
                      loading={isLoading}
                      disabled={!step2SettingsValid || selectedFiles.length === 0}
                    >
                      {isLoading ? t("loading") : t("split.submit", "Split PDF")}
                    </Button>
                  </form>
                )}
              </Stack>
            )}
          </Paper>
        )}

        {/* Step 3: Results */}
        {showStep3 && (
          <Paper p="md" withBorder>
            <Text fw={500} size="lg" mb="sm">3. Results</Text>

            {status && <Text size="sm" c="dimmed" mb="md">{status}</Text>}

            {errorMessage && (
              <Notification color="red" title={t("error._value", "Error")} onClose={() => setErrorMessage(null)} mb="md">
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
                mb="md"
              >
              </Button>
            )}

            {/* Split Results Preview */}
            {(splitResults.files.length > 0 || splitResults.isGeneratingThumbnails) && (
                <Box mt="lg" p="md" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
                  <Text fw={500} size="md" mb="sm">
                    Split Results ({splitResults.files.length} files)
                  </Text>

                  {splitResults.isGeneratingThumbnails ? (
                    <Center p="lg">
                      <Stack align="center" gap="sm">
                        <Loader size="sm" />
                        <Text size="sm" c="dimmed">Generating previews...</Text>
                      </Stack>
                    </Center>
                  ) : (
                    <Grid>
                      {splitResults.files.map((file, index) => (
                        <Grid.Col span={{ base: 6, sm: 4, md: 3 }} key={index}>
                          <Paper
                            p="xs"
                            withBorder
                            style={{
                              textAlign: 'center',
                              height: '200px',
                              display: 'flex',
                              flexDirection: 'column',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={() => handleThumbnailClick(file)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.02)';
                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)';
                              e.currentTarget.style.boxShadow = '';
                            }}
                          >
                            <Box style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {splitResults.thumbnails[index] ? (
                                <Image
                                  src={splitResults.thumbnails[index]}
                                  alt={`Preview of ${file.name}`}
                                  style={{
                                    maxWidth: '100%',
                                    maxHeight: '140px',
                                    objectFit: 'contain'
                                  }}
                                />
                              ) : (
                                <Text size="xs" c="dimmed">No preview</Text>
                              )}
                            </Box>
                            <Text
                              size="xs"
                              c="dimmed"
                              mt="xs"
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={file.name}
                            >
                              {file.name}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {(file.size / 1024).toFixed(1)} KB
                            </Text>
                          </Paper>
                        </Grid.Col>
                      ))}
                    </Grid>
                  )}
              </Box>
            )}
          </Paper>
        )}
      </Stack>
    </Box>
  );
};

export default SplitPdfPanel;
