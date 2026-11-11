import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner } from "@editor/ui/Banner";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import { Select } from "@editor/ui/Select";
import { Spinner } from "@editor/ui/Spinner";
import { downloadFile } from "@editor/services/downloadService";
import { ToolPanelFooter } from "@editor/components/tools/ToolPanelFooter";
import { AccessibilityReportView } from "@editor/components/tools/checkAccessibility/AccessibilityReportView";
import type { CheckAccessibilityOperationHook } from "@editor/hooks/tools/checkAccessibility/useCheckAccessibilityOperation";
import { createAccessibilityReportPdf } from "@editor/hooks/tools/checkAccessibility/accessibilityReportPdf";
import { assessAccessibilityReport } from "@editor/utils/accessibilityAssessment";
import { resultLabel } from "@editor/utils/accessibilityReportContent";
import type { FileId } from "@editor/types/file";
import type { AccessibilityReportEntry } from "@editor/types/checkAccessibility";
import "@editor/components/tools/checkAccessibility/CheckAccessibility.css";

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
  const { results, isLoading, status, files } = operation;

  const options = useMemo(
    () =>
      results.map((entry) => ({
        value: entry.fileId,
        label: entry.report
          ? `${entry.fileName} · ${resultLabel(t, assessAccessibilityReport(entry.report).result)}`
          : `${entry.fileName} · ${t("checkAccessibility.fileFailed", "failed")}`,
      })),
    [results, t],
  );

  const [buildingPdf, setBuildingPdf] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  const downloadReportPdf = async (entry: AccessibilityReportEntry) => {
    setBuildingPdf(true);
    setDownloadFailed(false);
    try {
      const pdf = await createAccessibilityReportPdf(entry, t);
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
  const reportFile = files[0];

  if (!selected) {
    return isLoading ? (
      <div className="a11y-loading">
        <Spinner size="sm" />
        <span>{status}</span>
      </div>
    ) : null;
  }

  return (
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

      {reportFile && (
        <ToolPanelFooter>
          <div className="a11y-download">
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
            <Button
              fullWidth
              loading={buildingPdf}
              leftSection={<Icon name="download" size={16} />}
              onClick={() => void downloadReportPdf(selected)}
            >
              {t(
                "checkAccessibility.download",
                "Download accessibility report",
              )}
            </Button>
          </div>
        </ToolPanelFooter>
      )}
    </div>
  );
}
