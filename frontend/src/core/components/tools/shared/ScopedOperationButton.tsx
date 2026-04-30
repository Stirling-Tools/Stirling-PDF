import { Text } from "@mantine/core";
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
 * - File-editor mode with N>1 selected files: appends "(N files)" to button text.
 * - File-editor mode with 0 selected files: shows a hint to select files.
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
  const { files: allFiles } = useAllFiles();

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

  const showSelectFilesHint =
    !disableScopeHints &&
    isFileEditorMode &&
    allFiles.length > 0 &&
    selectedFiles.length === 0;

  return (
    <>
      <OperationButton {...props} submitText={scopedText} />
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
