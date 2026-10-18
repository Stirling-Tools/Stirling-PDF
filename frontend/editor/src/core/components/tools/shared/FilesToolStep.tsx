import React from "react";
import FileStatusIndicator from "@app/components/tools/shared/FileStatusIndicator";
import { StirlingFile } from "@app/types/fileContext";
import i18n from "@app/i18n";
import { useViewScopedFileStubs } from "@app/hooks/tools/shared/useViewScopedFiles";
import { usePdfAccess } from "@app/hooks/usePdfAccess";
import { getPdfAccess } from "@app/services/pdfPasswordStore";

export interface FilesToolStepProps {
  selectedFiles: StirlingFile[];
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
  minFiles?: number;
  showUnavailableFiles?: boolean;
}

function FilesStepContent({
  selectedFiles,
  minFiles,
  showUnavailableFiles = true,
}: FilesToolStepProps) {
  usePdfAccess(undefined);
  const files = useViewScopedFileStubs();
  const unavailableFiles = showUnavailableFiles
    ? files.filter(
        (file) =>
          file.processedFile?.isEncrypted &&
          getPdfAccess(file.id) &&
          !selectedFiles.some((selected) => selected.fileId === file.id),
      )
    : [];
  return (
    <FileStatusIndicator
      selectedFiles={selectedFiles}
      minFiles={minFiles}
      unavailableFiles={unavailableFiles}
    />
  );
}

interface StepBaseProps {
  isVisible?: boolean;
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
}

export function createFilesToolStep<T>(
  createStep: (
    title: string,
    props: StepBaseProps,
    children?: React.ReactNode,
  ) => T,
  props: FilesToolStepProps,
): T {
  return createStep(
    i18n.t("files.title", "Files"),
    {
      isVisible: true,
      isCollapsed: props.isCollapsed,
      onCollapsedClick: props.onCollapsedClick,
    },
    <FilesStepContent {...props} />,
  );
}
