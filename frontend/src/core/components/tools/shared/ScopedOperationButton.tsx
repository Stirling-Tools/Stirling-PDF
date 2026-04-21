import { Text, Box, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";
import OperationButton, {
  OperationButtonProps,
} from "@app/components/tools/shared/OperationButton";
import { StirlingFile } from "@app/types/fileContext";
import { useAllFiles } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useNavigationState } from "@app/contexts/NavigationContext";

export interface ScopedOperationButtonProps extends OperationButtonProps {
  selectedFiles: StirlingFile[];
  disableScopeHints?: boolean;
}

/**
 * Wraps OperationButton with scope-aware button text and a filename note.
 *
 * - Viewer mode (multiple files loaded): appends "(this file)" to button text and
 *   shows a note naming the exact file that will be processed.
 * - N>1 files loaded: appends "(N files)" to button text.
 * - All other cases: no change to button text or layout.
 */
export function ScopedOperationButton({
  selectedFiles,
  disableScopeHints,
  ...props
}: ScopedOperationButtonProps) {
  const { t } = useTranslation();
  const { workbench } = useNavigationState();
  const { activeFileIndex } = useViewer();
  const { files: allFiles, fileIds } = useAllFiles();

  // Disable until all files are hydrated — running early would silently skip unloaded files.
  const isFilesHydrating = fileIds.length > allFiles.length;
  const effectiveDisabledReason =
    isFilesHydrating && props.disabledReason !== "endpointUnavailable" ? "filesLoading" : props.disabledReason;

  const isViewerMode = workbench === "viewer";
  const isFileEditorMode = workbench === "fileEditor";
  const hasMultipleFilesLoaded = allFiles.length > 1;
  const baseText = props.submitText ?? t("submit", "Submit");

  const disabledForViewerMode = props.disabledReason === "viewerMode";

  let scopedText = baseText;
  if (!disableScopeHints && !disabledForViewerMode) {
    if (isViewerMode && hasMultipleFilesLoaded) {
      scopedText = `${baseText} (${t("tool.scopeThisFile", "this file")})`;
    } else if (!isViewerMode && selectedFiles.length > 1) {
      scopedText = `${baseText} (${selectedFiles.length} ${t("tool.scopeFiles", "files")})`;
    }
  }

  const viewerFileName =
    !disableScopeHints &&
    !disabledForViewerMode &&
    isViewerMode &&
    hasMultipleFilesLoaded
      ? allFiles[activeFileIndex]?.name
      : null;

  const pendingCount = fileIds.length - allFiles.length;
  const isBulkLoading = pendingCount > 1;
  const loadProgress = isBulkLoading ? (allFiles.length / fileIds.length) * 100 : 0;
  const showSelectFilesHint =
    !disableScopeHints &&
    isFileEditorMode &&
    allFiles.length > 0 &&
    selectedFiles.length === 0;

  return (
    <>
      {isFilesHydrating ? (
        <Box mx="md" mt="md">
          <Button
            fullWidth
            disabled
            loading={!isBulkLoading}
            variant={props.variant ?? "filled"}
            color={props.color ?? "blue"}
            style={{ position: "relative", overflow: "hidden", minHeight: "2.5rem", pointerEvents: "none" }}
          >
            {isBulkLoading && (
              <>
                <Box
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${loadProgress}%`,
                    backgroundColor: "rgba(255,255,255,0.15)",
                    transition: "width 0.3s ease",
                    borderRadius: "inherit",
                  }}
                />
                <Text size="sm" style={{ position: "relative" }}>
                  {t("tool.filesLoadingProgress", "{{loaded}} / {{total}} files loading...", {
                    loaded: allFiles.length,
                    total: fileIds.length,
                  })}
                </Text>
              </>
            )}
          </Button>
        </Box>
      ) : (
        <OperationButton {...props} submitText={scopedText} disabledReason={effectiveDisabledReason} />
      )}
      {viewerFileName && (
        <Text size="xs" c="dimmed" ta="center" mx="md" mt={2}>
          {t("tool.singleFileScope", "Only applying to: {{fileName}}", {
            fileName: viewerFileName,
          })}
        </Text>
      )}
      {showSelectFilesHint && (
        <Text size="xs" c="dimmed" ta="center" mx="md" mt={2}>
          {t(
            "tool.selectFilesHint",
            "Select files in Active Files to run this tool",
          )}
        </Text>
      )}
    </>
  );
}
