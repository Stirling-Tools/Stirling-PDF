import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { useBaseTool } from "@editor/hooks/tools/shared/useBaseTool";
import { useToolPanelSize } from "@editor/hooks/useToolPanelSize";
import { BaseToolProps, ToolComponent } from "@editor/types/tool";
import { Select } from "@editor/ui/Select";
import {
  defaultParameters,
  useCheckAccessibilityParameters,
  type AccessibilityProfile,
} from "@editor/hooks/tools/checkAccessibility/useCheckAccessibilityParameters";
import {
  useCheckAccessibilityOperation,
  type CheckAccessibilityOperationHook,
} from "@editor/hooks/tools/checkAccessibility/useCheckAccessibilityOperation";
import { AccessibilityResults } from "@editor/components/tools/checkAccessibility/AccessibilityResults";
import type { FileId } from "@editor/types/file";
import { useReviewAvailable } from "@editor/tools/pdfTextEditor/hooks/useEditOrReview";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { reviewMode } from "@editor/tools/pdfTextEditor/store/reviewMode";

const PROFILE_OPTIONS: { value: AccessibilityProfile; label: string }[] = [
  { value: "ua1", label: "PDF/UA-1" },
  { value: "ua2", label: "PDF/UA-2 (PDF 2.0)" },
];

const PdfAccessibility = (props: BaseToolProps) => {
  const { t } = useTranslation();
  useToolPanelSize("lg");
  const base = useBaseTool(
    "checkAccessibility",
    useCheckAccessibilityParameters,
    useCheckAccessibilityOperation,
    props,
  );
  const operation = base.operation as CheckAccessibilityOperationHook;
  const hasReports = operation.results.length > 0;
  const [selectedFileId, setSelectedFileId] = useState<FileId | null>(null);
  const hasFiles = base.selectedFiles.length > 0;
  useCheckWhenIdle(
    hasFiles,
    base.endpointEnabled,
    operation,
    base.handleExecute,
  );
  useReviewInViewer(hasFiles);

  return (
    <Stack gap="sm" p="sm" data-testid="check-accessibility">
      <Select
        aria-label={t("checkAccessibility.steps.standard", "Standard")}
        options={PROFILE_OPTIONS}
        value={base.params.parameters.profile}
        onChange={(value) =>
          value &&
          base.params.updateParameter("profile", value as AccessibilityProfile)
        }
        allowDeselect={false}
        disabled={operation.isLoading}
        data-testid="check-accessibility-standard"
      />
      {!hasFiles && (
        <Text size="sm" c="dimmed">
          {t("checkAccessibility.noFiles", "Select a PDF to check it.")}
        </Text>
      )}
      {hasFiles && operation.errorMessage && !operation.isLoading && (
        <Button
          variant="secondary"
          onClick={() => void base.handleExecute()}
          data-testid="check-accessibility-submit"
        >
          {t("checkAccessibility.retry", "Check again")}
        </Button>
      )}
      {(hasReports || operation.isLoading) && (
        <AccessibilityResults
          operation={operation}
          selectedFileId={selectedFileId}
          onSelectFile={setSelectedFileId}
        />
      )}
    </Stack>
  );
};

/**
 * Checks the selected files whenever the tool holds no report: on opening and after a
 * new selection, standard or saved version clears it. A failed run keeps its error.
 */
function useCheckWhenIdle(
  hasFiles: boolean,
  endpointEnabled: boolean | null,
  operation: CheckAccessibilityOperationHook,
  check: () => Promise<void>,
): void {
  const idle =
    hasFiles &&
    endpointEnabled === true &&
    !operation.isLoading &&
    operation.results.length === 0 &&
    !operation.errorMessage;
  useEffect(() => {
    if (idle) void check();
  }, [idle, check]);
}

/**
 * Opens the review while the viewer shows a file; elsewhere the tool checks every
 * selected file and the review waits for one to be opened.
 */
function useReviewInViewer(hasFiles: boolean): void {
  const { workbench } = useNavigationState();
  const available = useReviewAvailable();
  useEffect(() => {
    if (!available || !hasFiles || workbench !== "viewer") return;
    if (!reviewMode.get().reviewing)
      reviewMode.set({ reviewing: true, startAt: null });
  }, [available, hasFiles, workbench]);
}

const PdfAccessibilityTool = PdfAccessibility as ToolComponent;
PdfAccessibilityTool.tool = () => useCheckAccessibilityOperation;
PdfAccessibilityTool.getDefaultParameters = () => ({ ...defaultParameters });

export default PdfAccessibilityTool;
