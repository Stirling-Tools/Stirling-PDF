import React, { useCallback, useMemo } from "react";
import { Box, Center, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { useAllFiles } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { detectNonPdfFileType } from "@app/utils/fileUtils";
import { getNonPdfConversionPlan } from "@app/utils/nonPdfConversion";

import { CsvViewer } from "@app/components/viewer/nonpdf/CsvViewer";
import { HtmlViewer } from "@app/components/viewer/nonpdf/HtmlViewer";
import { ImageViewer } from "@app/components/viewer/nonpdf/ImageViewer";
import { JsonViewer } from "@app/components/viewer/nonpdf/JsonViewer";
import { NonPdfConversionPanel } from "@app/components/viewer/nonpdf/NonPdfConversionPanel";
import { TextViewer } from "@app/components/viewer/nonpdf/TextViewer";

export interface ViewerProps {
  onClose?: () => void;
  previewFile?: File | null;
}

export interface NonPdfViewerProps extends ViewerProps {
  file: File;
  /** Runs after the converted PDF is active, so callers can leave preview mode. */
  onConverted?: () => void;
}

export function NonPdfViewer({ file, onConverted }: NonPdfViewerProps) {
  const fileType = useMemo(() => detectNonPdfFileType(file), [file]);
  const plan = useMemo(() => getNonPdfConversionPlan(file.name), [file.name]);
  const { toolAvailability } = useToolWorkflow();

  // Optimistic while endpoint availability is still loading: an empty map means
  // "unknown", not "disabled". Only an explicit server-side false hides the action.
  const conversionDisabled = toolAvailability["convert"]?.available === false;
  const previewable = fileType !== "unknown";

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
        return null;
    }
  };

  return (
    <Stack
      gap={0}
      data-testid="nonpdf-viewer"
      style={{
        height: "100%",
        flex: 1,
        overflow: "hidden",
      }}
    >
      {previewable && (
        <NonPdfConversionPanel
          file={file}
          plan={plan}
          variant="compact"
          disabled={conversionDisabled}
          onConverted={onConverted}
        />
      )}
      <Box
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {previewable ? (
          renderContent()
        ) : (
          <NonPdfConversionPanel
            file={file}
            plan={plan}
            variant="hero"
            disabled={conversionDisabled}
            onConverted={onConverted}
          />
        )}
      </Box>
    </Stack>
  );
}

export function NonPdfViewerWrapper(props: ViewerProps) {
  const { t } = useTranslation();
  const { files: activeFiles } = useAllFiles();
  const { activeFileIndex } = useViewer();
  const { setPreviewFile } = useToolWorkflow();

  const file =
    props.previewFile ?? activeFiles[activeFileIndex] ?? activeFiles[0] ?? null;

  const handleConverted = useCallback(() => {
    // The preview has priority over the workspace in Viewer, so leaving it set
    // would hide the PDF that was just made active.
    if (props.previewFile) setPreviewFile(null);
  }, [props.previewFile, setPreviewFile]);

  if (!file) {
    return (
      <Center style={{ flex: 1 }}>
        <Text c="dimmed" size="sm">
          {t("viewer.nonPdf.noFile", "No file loaded")}
        </Text>
      </Center>
    );
  }

  return <NonPdfViewer {...props} file={file} onConverted={handleConverted} />;
}

export default NonPdfViewerWrapper;
