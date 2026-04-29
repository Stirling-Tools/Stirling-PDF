import { useCallback, useMemo } from "react";
import { Box, Button, Center, Stack, Text } from "@mantine/core";
import ArticleIcon from "@mui/icons-material/Article";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";

import { useFileState } from "@app/contexts/FileContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import {
  detectFileExtension,
  detectNonPdfFileType,
} from "@app/utils/fileUtils";
import { CONVERSION_MATRIX } from "@app/constants/convertConstants";

import { NonPdfBanner } from "@app/components/viewer/nonpdf/NonPdfBanner";
import { getFileTypeMeta } from "@app/components/viewer/nonpdf/types";
import { ImageViewer } from "@app/components/viewer/nonpdf/ImageViewer";
import { CsvViewer } from "@app/components/viewer/nonpdf/CsvViewer";
import { JsonViewer } from "@app/components/viewer/nonpdf/JsonViewer";
import { TextViewer } from "@app/components/viewer/nonpdf/TextViewer";
import { HtmlViewer } from "@app/components/viewer/nonpdf/HtmlViewer";

export interface ViewerProps {
  sidebarsVisible: boolean;
  setSidebarsVisible: (v: boolean) => void;
  onClose?: () => void;
  previewFile?: File | null;
  activeFileIndex?: number;
  setActiveFileIndex?: (index: number) => void;
}

export interface NonPdfViewerProps extends ViewerProps {
  file: File;
}

export function NonPdfViewer({ file }: NonPdfViewerProps) {
  const fileType = useMemo(() => detectNonPdfFileType(file), [file]);
  const meta = useMemo(
    () => getFileTypeMeta(fileType, file.name),
    [fileType, file.name],
  );

  const { handleToolSelect, toolAvailability } = useToolWorkflow();

  const fileExtension = detectFileExtension(file.name);
  // Only show convert when the extension has an explicit entry in the conversion matrix
  // (skip the 'any'/'image' wildcard fallbacks that would match everything)
  const isConvertAvailable =
    toolAvailability["convert"]?.available === true &&
    fileExtension !== "" &&
    fileExtension in CONVERSION_MATRIX;

  const handleConvertToPdf = useCallback(() => {
    handleToolSelect("convert");
  }, [handleToolSelect]);

  const renderContent = () => {
    switch (fileType) {
      case "image":
        return <ImageViewer file={file} fileName={file.name} />;
      case "csv":
        return (
          <CsvViewer
            file={file}
            isTsv={file.name.toLowerCase().endsWith(".tsv")}
          />
        );
      case "json":
        return <JsonViewer file={file} />;
      case "markdown":
        return <TextViewer file={file} isMarkdown />;
      case "text":
        return <TextViewer file={file} isMarkdown={false} />;
      case "html":
        return <HtmlViewer file={file} />;
      default:
        return (
          <Center style={{ flex: 1 }}>
            <Stack align="center" gap="sm">
              <ArticleIcon
                style={{
                  fontSize: "3rem",
                  color: "var(--mantine-color-gray-4)",
                }}
              />
              <Text c="dimmed" size="sm">
                Preview not available for this file type
              </Text>
              {isConvertAvailable && (
                <Button
                  variant="light"
                  color="orange"
                  leftSection={<PictureAsPdfIcon />}
                  onClick={handleConvertToPdf}
                >
                  Convert to PDF
                </Button>
              )}
            </Stack>
          </Center>
        );
    }
  };

  return (
    <Stack
      gap={0}
      style={{
        height: "100%",
        flex: 1,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <NonPdfBanner
        meta={meta}
        onConvertToPdf={isConvertAvailable ? handleConvertToPdf : undefined}
      />
      <Box
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {renderContent()}
      </Box>
    </Stack>
  );
}

// ─── Wrapper that resolves the active file from FileContext ───────────────────

export function NonPdfViewerWrapper(props: ViewerProps) {
  const { selectors } = useFileState();
  const activeFiles = selectors.getFiles();
  const activeFileIndex = props.activeFileIndex ?? 0;

  const file =
    props.previewFile ?? activeFiles[activeFileIndex] ?? activeFiles[0] ?? null;

  if (!file) {
    return (
      <Center style={{ flex: 1 }}>
        <Text c="dimmed" size="sm">
          No file selected
        </Text>
      </Center>
    );
  }

  return <NonPdfViewer {...props} file={file} />;
}

export default NonPdfViewerWrapper;
