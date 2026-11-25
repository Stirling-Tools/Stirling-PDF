import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import { Banner } from "@editor/ui/Banner";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { Select } from "@editor/ui/Select";
import { Spinner } from "@editor/ui/Spinner";
import { downloadFile } from "@editor/services/downloadService";
import { ToolPanelFooter } from "@editor/components/tools/ToolPanelFooter";
import { AccessibilityReportView } from "@editor/components/tools/checkAccessibility/AccessibilityReportView";
import { ReportLanguageField } from "@editor/components/tools/checkAccessibility/ReportLanguageField";
import type { CheckAccessibilityOperationHook } from "@editor/hooks/tools/checkAccessibility/useCheckAccessibilityOperation";
import { createAccessibilityReportPdf } from "@editor/hooks/tools/checkAccessibility/accessibilityReportPdf";
import { assessAccessibilityReport } from "@editor/utils/accessibilityAssessment";
import { resultLabel } from "@editor/utils/accessibilityReportContent";
import type { FileId } from "@editor/types/file";
import type { AccessibilityFixTarget } from "@editor/utils/accessibilityFixes";
import type { AccessibilityReportEntry } from "@editor/types/checkAccessibility";
import "@editor/components/tools/checkAccessibility/CheckAccessibility.css";
import {
  AccessibilityFixContext,
  FixInDocumentButton,
  TagEverythingButton,
  type AccessibilityFixFn,
} from "@editor/components/tools/checkAccessibility/AccessibilityFix";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useNavigationActions } from "@editor/contexts/NavigationContext";
import { reviewMode } from "@editor/tools/pdfTextEditor/store/reviewMode";
import { useReviewAvailable } from "@editor/tools/pdfTextEditor/hooks/useEditOrReview";
import { reviewPanelSlot } from "@editor/tools/pdfTextEditor/store/reviewPanelSlot";

const NO_TICKS: ReadonlySet<number> = new Set();

interface AccessibilityResultsProps {
  operation: CheckAccessibilityOperationHook;
  /** Falls back to the first report when this file is not in the run. */
  selectedFileId: FileId | null;
  onSelectFile: (fileId: FileId) => void;
}

export function AccessibilityResults({
  operation,
  selectedFileId,
  onSelectFile,
}: AccessibilityResultsProps) {
  const { t } = useTranslation();
  const { results, isLoading, status } = operation;
  const { setActiveFileId } = useViewer();
  const { actions: navigationActions } = useNavigationActions();
  const reviewAvailable = useReviewAvailable();

  const options = useMemo(
    () =>
      results.map((entry) => ({
        value: entry.fileId,
        label: entry.report
          ? `${entry.fileName} - ${resultLabel(t, assessAccessibilityReport(entry.report).result)}`
          : `${entry.fileName} - ${t("checkAccessibility.fileFailed", "failed")}`,
      })),
    [results, t],
  );

  const [manualTicks, setManualTicks] = useState<
    Partial<Record<FileId, ReadonlySet<number>>>
  >({});
  // A new run starts a new checklist: the ticks were for the files as they were checked.
  useEffect(() => {
    if (isLoading) setManualTicks({});
  }, [isLoading]);
  const toggleManual = (fileId: FileId, index: number) =>
    setManualTicks((current) => {
      const next = new Set(current[fileId]);
      if (!next.delete(index)) next.add(index);
      return { ...current, [fileId]: next };
    });

  const [buildingPdf, setBuildingPdf] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  const downloadReportPdf = async (entry: AccessibilityReportEntry) => {
    setBuildingPdf(true);
    setDownloadFailed(false);
    try {
      const pdf = await createAccessibilityReportPdf(
        entry,
        t,
        manualTicks[entry.fileId] ?? NO_TICKS,
      );
      await downloadFile({ data: pdf, filename: pdf.name });
    } catch (error) {
      console.warn("[checkAccessibility] PDF report failed", error);
      setDownloadFailed(true);
    } finally {
      setBuildingPdf(false);
    }
  };

  const selected =
    results.find((entry) => entry.fileId === selectedFileId) ?? results[0];

  if (!selected) {
    return isLoading ? (
      <div className="a11y-loading">
        <Spinner size="sm" />
        <span>{status}</span>
      </div>
    ) : null;
  }

  const openInReview = (
    target: AccessibilityFixTarget | null,
    page?: number,
    autoTag = false,
  ) => {
    reviewMode.set({
      reviewing: true,
      startAt: target && {
        fileId: selected.fileId,
        pageIndex: (page ?? 1) - 1,
        target,
        autoTag,
      },
    });
    setActiveFileId(selected.fileId);
    navigationActions.setWorkbench("viewer");
  };
  const fixInDocument: AccessibilityFixFn = (target, page) =>
    openInReview(target, page);
  const passing =
    !!selected.report &&
    assessAccessibilityReport(selected.report).result === "pass";
  // A file the check could not read can still be tagged: the review reads it itself.
  const tagEverything = reviewAvailable && !passing && (
    <TagEverythingButton
      className="a11y-actions__cta"
      onTag={() => openInReview("untagged", undefined, true)}
    />
  );
  const downloadLabel = t(
    "checkAccessibility.download",
    "Download accessibility report",
  );

  return (
    <AccessibilityFixContext.Provider
      value={reviewAvailable ? fixInDocument : null}
    >
      <div className="a11y-results" data-testid="a11y-results">
        {(results.length > 1 || isLoading) && (
          <div className="a11y-picker">
            <Select
              aria-label={t("checkAccessibility.pickFile", "Show results for")}
              options={options}
              value={selected.fileId}
              onChange={(value) => {
                const entry = results.find((item) => item.fileId === value);
                if (entry) onSelectFile(entry.fileId);
              }}
              allowDeselect={false}
              searchable={results.length > 6}
            />
            {isLoading && (
              <div className="a11y-loading">
                <Spinner size="sm" />
                <span>{status}</span>
              </div>
            )}
          </div>
        )}

        {selected.report ? (
          <AccessibilityReportView
            key={selected.fileId}
            report={selected.report}
            manualTicked={manualTicks[selected.fileId] ?? NO_TICKS}
            languageFix={
              reviewAvailable && (
                <ReportLanguageField
                  fileId={selected.fileId}
                  report={selected.report}
                  onOpenInReview={() => openInReview(null)}
                />
              )
            }
            live={<div ref={reviewPanelSlot.attach} className="a11y-live" />}
            onToggleManual={(index) => toggleManual(selected.fileId, index)}
            onSetAllManual={(done) =>
              setManualTicks((current) => ({
                ...current,
                [selected.fileId]: new Set(
                  done
                    ? selected.report?.humanChecks.map((_, index) => index)
                    : [],
                ),
              }))
            }
          />
        ) : (
          <Banner
            tone="danger"
            title={t(
              "checkAccessibility.error.fileTitle",
              "This file could not be checked",
            )}
            description={selected.error}
          />
        )}

        {!isLoading && (selected.report || tagEverything) && (
          <ToolPanelFooter>
            <div className="a11y-footer">
              {downloadFailed && (
                <Banner
                  tone="danger"
                  title={t(
                    "checkAccessibility.error.download",
                    "The accessibility report could not be created. Try again.",
                  )}
                  onDismiss={() => setDownloadFailed(false)}
                />
              )}
              <div className="a11y-actions">
                {selected.report && (
                  <FixInDocumentButton
                    className="a11y-actions__cta"
                    passing={passing}
                  />
                )}
                {tagEverything}
                {/* Alone, the download is the report's only action and keeps its label. */}
                {selected.report && !reviewAvailable && (
                  <Button
                    fullWidth
                    loading={buildingPdf}
                    leftSection={<Icon name="download" size={16} />}
                    onClick={() => void downloadReportPdf(selected)}
                    data-testid="a11y-download-report"
                  >
                    {downloadLabel}
                  </Button>
                )}
                {selected.report && reviewAvailable && (
                  <Tooltip label={downloadLabel}>
                    <Button
                      variant="secondary"
                      aria-label={downloadLabel}
                      loading={buildingPdf}
                      leftSection={<Icon name="download" size={16} />}
                      onClick={() => void downloadReportPdf(selected)}
                      data-testid="a11y-download-report"
                    />
                  </Tooltip>
                )}
              </div>
            </div>
          </ToolPanelFooter>
        )}
      </div>
    </AccessibilityFixContext.Provider>
  );
}
