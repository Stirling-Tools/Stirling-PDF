import React, { useCallback, useMemo } from "react";
import { Box, Center, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { useAllFiles } from "@editor/contexts/FileContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import {
  detectFileExtension,
  detectNonPdfFileType,
} from "@editor/utils/fileUtils";
import { CONVERSION_MATRIX } from "@editor/constants/convertConstants";

import { NonPdfBanner } from "@editor/components/viewer/nonpdf/NonPdfBanner";
import { ImageViewer } from "@editor/components/viewer/nonpdf/ImageViewer";
import { CsvViewer } from "@editor/components/viewer/nonpdf/CsvViewer";
import { JsonViewer } from "@editor/components/viewer/nonpdf/JsonViewer";
import { TextViewer } from "@editor/components/viewer/nonpdf/TextViewer";
import { HtmlViewer } from "@editor/components/viewer/nonpdf/HtmlViewer";

export interface ViewerProps {
  onClose?: () => void;
  previewFile?: File | null;
}

export interface NonPdfViewerProps extends ViewerProps {
  file: File;
}

export function NonPdfViewer({ file }: NonPdfViewerProps) {
  const { t } = useTranslation();
  const fileType = useMemo(() => detectNonPdfFileType(file), [file]);

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
              <Icon
                name="file-text"
                size={"3rem"}
                style={{ color: "var(--mantine-color-gray-4)" }}
              />
              <Text c="dimmed" size="sm">
                {t(
                  "viewer.nonPdf.previewUnavailable",
                  "Preview not available for this file type",
                )}
              </Text>
              {isConvertAvailable && (
                <Button
                  variant="secondary"
                  accent="warning"
                  leftSection={<Icon name="file-pdf" />}
                  onClick={handleConvertToPdf}
                >
                  {t("viewer.nonPdf.convertToPdf", "Convert to PDF")}
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
        // The Convert button floats over the content; viewers that draw their
        // own top bar read this to keep their text clear of it.
        "--nonpdf-action-inset": isConvertAvailable ? "11rem" : "0rem",
      }}
    >
      <NonPdfBanner
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
  const { t } = useTranslation();
  const { files: activeFiles } = useAllFiles();
  const { activeFileIndex } = useViewer();

  const file =
    props.previewFile ?? activeFiles[activeFileIndex] ?? activeFiles[0] ?? null;

  if (!file) {
    return (
      <Center style={{ flex: 1 }}>
        <Text c="dimmed" size="sm">
          {t("viewer.nonPdf.noFile", "No file loaded")}
        </Text>
      </Center>
    );
  }

  return <NonPdfViewer {...props} file={file} />;
}

export default NonPdfViewerWrapper;
