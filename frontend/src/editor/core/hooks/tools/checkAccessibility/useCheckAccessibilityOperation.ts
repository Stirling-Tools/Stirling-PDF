import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import apiClient from "@editor/services/apiClient";
import { handleHttpError } from "@editor/services/httpErrorHandler";
import { ToolOperationHook } from "@editor/hooks/tools/shared/useToolOperation";
import type { StirlingFile } from "@editor/types/fileContext";
import { extractErrorMessage } from "@editor/utils/toolErrorHandler";
import { serverErrorReason } from "@editor/services/errorUtils";
import type {
  AccessibilityReport,
  AccessibilityReportEntry,
} from "@editor/types/checkAccessibility";
import type { CheckAccessibilityParameters } from "@editor/hooks/tools/checkAccessibility/useCheckAccessibilityParameters";

const NO_FILES: File[] = [];

export interface CheckAccessibilityOperationHook extends ToolOperationHook<CheckAccessibilityParameters> {
  results: AccessibilityReportEntry[];
}

/**
 * Reports on each file in turn without changing it. `files` stays empty: a file there makes
 * useBaseTool skip the next selection change, which would leave the old report on screen.
 */
export const useCheckAccessibilityOperation =
  (): CheckAccessibilityOperationHook => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [results, setResults] = useState<AccessibilityReportEntry[]>([]);
    // Each run takes the next id; a run whose id is no longer current was cancelled or replaced
    // and must not touch state, or a cancelled run could resume beside the run that replaced it.
    const currentRun = useRef(0);
    const runAbort = useRef<AbortController | null>(null);

    /** Stops the current run, including the request in flight, so it is not billed for nothing. */
    const stopRun = useCallback(() => {
      currentRun.current += 1;
      runAbort.current?.abort();
      runAbort.current = null;
    }, []);

    useEffect(() => stopRun, [stopRun]);

    const resetResults = useCallback(() => {
      stopRun();
      // The run this just invalidated may no longer touch state, so it cannot clear loading itself.
      setIsLoading(false);
      setResults([]);
      setStatus("");
      setErrorMessage(null);
    }, [stopRun]);

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

        stopRun();
        const run = currentRun.current;
        const abort = new AbortController();
        runAbort.current = abort;
        const isCurrent = () => run === currentRun.current;
        setIsLoading(true);
        setErrorMessage(null);
        setResults([]);

        const collected: AccessibilityReportEntry[] = [];
        try {
          for (const [index, file] of selectedFiles.entries()) {
            if (!isCurrent()) return;
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
                // A failure shows as that file's error in the report, and a
                // superseded run's abort is no failure at all.
                { signal: abort.signal, suppressErrorToast: true },
              );
              // A report the validator could not produce describes the failure, not the file,
              // so scoring it would grade a document nothing has checked.
              collected.push({
                fileId: file.fileId,
                fileName: file.name,
                report: data.validationError ? null : data,
                error: data.validationError ?? null,
              });
            } catch (error) {
              // suppressErrorToast also skips the login redirect a 401 needs.
              if (
                isCurrent() &&
                axios.isAxiosError(error) &&
                error.response?.status === 401
              ) {
                if (error.config) error.config.suppressErrorToast = false;
                await handleHttpError(error);
              }
              collected.push({
                fileId: file.fileId,
                fileName: file.name,
                report: null,
                error: unreachable(error)
                  ? t(
                      "checkAccessibility.error.unreachable",
                      "The server didn't answer. Check it's running, then check again.",
                    )
                  : // The server says why in a JSON body, such as a file over the size limit.
                    ((await serverErrorReason(error)) ??
                    extractErrorMessage(error)),
              });
            }
            if (!isCurrent()) return;
            // Publishing as each file lands lets the first report render while the rest run.
            setResults([...collected]);
          }

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
          if (isCurrent()) {
            runAbort.current = null;
            setIsLoading(false);
          }
        }
      },
      [stopRun, t],
    );

    const cancelOperation = useCallback(() => {
      if (!isLoading) return;
      stopRun();
      setIsLoading(false);
      setStatus(t("operationCancelled", "Operation cancelled"));
    }, [isLoading, stopRun, t]);

    const undoOperation = useCallback(async () => {
      resetResults();
    }, [resetResults]);

    return useMemo<CheckAccessibilityOperationHook>(
      () => ({
        files: NO_FILES,
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
        isLoading,
        resetResults,
        results,
        status,
        undoOperation,
      ],
    );
  };

/** No response at all: the server is down or the connection dropped, not a cancelled run. */
function unreachable(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    !error.response &&
    error.code !== axios.AxiosError.ERR_CANCELED
  );
}
