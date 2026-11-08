import React from "react";
import FileStatusIndicator from "@editor/components/tools/shared/FileStatusIndicator";
import { StirlingFile } from "@editor/types/fileContext";
import i18n from "@editor/i18n";
import { useViewScopedFileStubs } from "@editor/hooks/tools/shared/useViewScopedFiles";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import { getPdfAccess } from "@editor/services/pdfAccessService";
import { useToolWorkflow } from "@editor/contexts/ToolWorkflowContext";
import { rightsManagedToolBlockReason } from "@editor/services/rightsManagedTools";
import { useRightsManagedPdfRevision } from "@editor/hooks/useRightsManagedPdf";
import type { UnavailableProtectedFile } from "@editor/components/tools/shared/ProtectedPdfToolNotice";

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
  const { selectedTool } = useToolWorkflow();
  const endpoint = selectedTool?.operationConfig?.endpoint;
  useRightsManagedPdfRevision();
  const notSelected = files.filter(
    (file) => !selectedFiles.some((selected) => selected.fileId === file.id),
  );
  const unavailableFiles: UnavailableProtectedFile[] = showUnavailableFiles
    ? notSelected.flatMap((file): UnavailableProtectedFile[] => {
        const rightsManagedReason =
          typeof endpoint === "string"
            ? rightsManagedToolBlockReason(endpoint, file.id)
            : undefined;
        if (rightsManagedReason)
          return [
            { file, reason: rightsManagedReason, passwordProtected: false },
          ];
        if (file.processedFile?.isEncrypted && getPdfAccess(file.id))
          return [
            {
              file,
              reason: i18n.t(
                "encryptedPdfUnlock.toolUnavailable",
                "This tool doesn't support encrypted PDFs. Remove the password first.",
              ),
              passwordProtected: true,
            },
          ];
        return [];
      })
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
