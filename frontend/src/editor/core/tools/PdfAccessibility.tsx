import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { Banner } from "@editor/ui/Banner";
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
import type { StirlingFile } from "@editor/types/fileContext";
import type { AccessibilityReportEntry } from "@editor/types/checkAccessibility";
import { useAllFiles } from "@editor/contexts/FileContext";
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
  const checked = base.operation as CheckAccessibilityOperationHook;
  const carried = useReportsCarriedOverSaves(
    base.selectedFiles,
    base.params.parameters.profile,
    checked,
  );
  const operation = carried ? { ...checked, results: carried } : checked;
  const hasReports = operation.results.length > 0;
  const [selectedFileId, setSelectedFileId] = useState<FileId | null>(null);
  const hasFiles = base.selectedFiles.length > 0;
  useCheckWhenIdle(
    hasFiles && !carried,
    base.endpointEnabled,
    checked,
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
      {carried && (
        <Banner
          tone="info"
          title={t(
            "checkAccessibility.outOfDate.title",
            "Checked before your last save",
          )}
          description={t(
            "checkAccessibility.outOfDate.description",
            "Check again to see your changes in the report.",
          )}
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void base.handleExecute()}
              data-testid="check-accessibility-recheck"
            >
              {t("checkAccessibility.retry", "Check again")}
            </Button>
          }
        />
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
 * The last reports for the files the selected ones are new versions of, or null
 * when the tool should check instead. Saving in the review replaces each file with
 * a new version, which clears the report; checking again at once would blank the
 * panel mid-task, so the old report stays, marked out of date, until the user
 * checks again. Only a saved version carries one over: a new selection, a failed
 * check or a changed standard still checks.
 */
function useReportsCarriedOverSaves(
  selectedFiles: readonly StirlingFile[],
  profile: AccessibilityProfile,
  operation: CheckAccessibilityOperationHook,
): AccessibilityReportEntry[] | null {
  const { fileStubs } = useAllFiles();
  const reports = useRef(
    new Map<
      FileId,
      { profile: AccessibilityProfile; entry: AccessibilityReportEntry }
    >(),
  );
  const { results, isLoading, errorMessage } = operation;

  let carried: AccessibilityReportEntry[] | null = null;
  if (
    !isLoading &&
    results.length === 0 &&
    !errorMessage &&
    selectedFiles.length > 0
  ) {
    carried = [];
    for (const file of selectedFiles) {
      const parent = fileStubs.find(
        (stub) => stub.id === file.fileId,
      )?.parentFileId;
      const last = parent ? reports.current.get(parent) : undefined;
      if (!last || last.profile !== profile) {
        carried = null;
        break;
      }
      carried.push({ ...last.entry, fileId: file.fileId, fileName: file.name });
    }
  }

  // Kept by file, so a second save finds the first one's carried report.
  const shown = carried ?? (isLoading ? [] : results);
  useEffect(() => {
    for (const entry of shown)
      reports.current.set(entry.fileId, { profile, entry });
  }, [shown, profile]);

  return carried;
}

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
