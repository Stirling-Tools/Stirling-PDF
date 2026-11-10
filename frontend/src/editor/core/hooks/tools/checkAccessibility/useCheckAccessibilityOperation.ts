import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import apiClient from "@editor/services/apiClient";
import { ToolOperationHook } from "@editor/hooks/tools/shared/useToolOperation";
import type { StirlingFile } from "@editor/types/fileContext";
import { extractErrorMessage } from "@editor/utils/toolErrorHandler";
import {
  ACCESSIBILITY_REPORT_FILENAME,
  type AccessibilityReport,
  type AccessibilityReportEntry,
} from "@editor/types/checkAccessibility";
import type { CheckAccessibilityParameters } from "@editor/hooks/tools/checkAccessibility/useCheckAccessibilityParameters";

export interface CheckAccessibilityOperationHook extends ToolOperationHook<CheckAccessibilityParameters> {
  results: AccessibilityReportEntry[];
}

/**
 * Reports on each file in turn without changing it. `files` holds the run as JSON so the tool
 * counts as having results; the PDF report is built only when it is downloaded.
 */
export const useCheckAccessibilityOperation =
  (): CheckAccessibilityOperationHook => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [results, setResults] = useState<AccessibilityReportEntry[]>([]);
    const cancelRequested = useRef(false);

    const resetResults = useCallback(() => {
      cancelRequested.current = false;
      setResults([]);
      setFiles([]);
      setStatus("");
      setErrorMessage(null);
    }, []);

    const clearError = useCallback(() => setErrorMessage(null), []);

    const executeOperation = useCallback(
      async (
        params: CheckAccessibilityParameters,
        selectedFiles: StirlingFile[],
      ) => {
        if (selectedFiles.length === 0) {
          setErrorMessage(t("noFileSelected", "No file loaded"));
          return;
        }

        cancelRequested.current = false;
        setIsLoading(true);
        setErrorMessage(null);
        setResults([]);
        setFiles([]);

        const collected: AccessibilityReportEntry[] = [];
        try {
          for (const [index, file] of selectedFiles.entries()) {
            if (cancelRequested.current) break;
            setStatus(
              t(
                "checkAccessibility.status.checking",
                "Checking {{current}} of {{total}}...",
                {
                  current: index + 1,
                  total: selectedFiles.length,
                },
              ),
            );

            const formData = new FormData();
            formData.append("fileInput", file);
            formData.append("profile", params.profile);
            try {
              const { data } = await apiClient.post<AccessibilityReport>(
                "/api/v1/security/accessibility-report",
                formData,
              );
              collected.push({
                fileId: file.fileId,
                fileName: file.name,
                report: data,
                error: null,
              });
            } catch (error) {
              collected.push({
                fileId: file.fileId,
                fileName: file.name,
                report: null,
                error: extractErrorMessage(error),
              });
            }
            // Publishing as each file lands lets the first report render while the rest run.
            setResults([...collected]);
          }

          if (cancelRequested.current) return;

          const payload = collected.map(({ fileName, report, error }) => ({
            fileName,
            report,
            error,
          }));
          setFiles([
            new File(
              [JSON.stringify(payload, null, 2)],
              ACCESSIBILITY_REPORT_FILENAME,
              {
                type: "application/json",
              },
            ),
          ]);
          if (collected.some((entry) => entry.error)) {
            setErrorMessage(
              t(
                "checkAccessibility.error.partial",
                "Some files could not be checked.",
              ),
            );
          }
          setStatus(t("checkAccessibility.status.complete", "Check complete"));
        } finally {
          setIsLoading(false);
        }
      },
      [t],
    );

    const cancelOperation = useCallback(() => {
      if (!isLoading) return;
      cancelRequested.current = true;
      setIsLoading(false);
      setStatus(t("operationCancelled", "Operation cancelled"));
    }, [isLoading, t]);

    const undoOperation = useCallback(async () => {
      resetResults();
    }, [resetResults]);

    return useMemo<CheckAccessibilityOperationHook>(
      () => ({
        files,
        thumbnails: [],
        isGeneratingThumbnails: false,
        downloadUrl: null,
        downloadFilename: "",
        isLoading,
        status,
        errorMessage,
        progress: null,
        executeOperation,
        resetResults,
        clearError,
        cancelOperation,
        undoOperation,
        results,
      }),
      [
        cancelOperation,
        clearError,
        errorMessage,
        executeOperation,
        files,
        isLoading,
        resetResults,
        results,
        status,
        undoOperation,
      ],
    );
  };
