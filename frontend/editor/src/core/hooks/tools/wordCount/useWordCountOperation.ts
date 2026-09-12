import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import { useFileContext } from "@app/contexts/file/fileHooks";
import { ToolOperationHook } from "@app/hooks/tools/shared/useToolOperation";
import type { StirlingFile } from "@app/types/fileContext";
import { extractErrorMessage } from "@app/utils/toolErrorHandler";
import type { WordCountParameters } from "@app/hooks/tools/wordCount/useWordCountParameters";

export interface PageCounts {
  wordCount: number;
  characterCount: number;
  characterCountNoSpaces: number;
  lineCount: number;
}

export interface WordCountResult {
  fileId: string;
  fileName: string;
  wordCount: number;
  characterCount: number;
  characterCountNoSpaces: number;
  lineCount: number;
  pages?: PageCounts[];
  error: string | null;
}

export interface WordCountOperationHook
  extends ToolOperationHook<WordCountParameters> {
  results: WordCountResult[];
}

export const useWordCountOperation = (): WordCountOperationHook => {
  const { t } = useTranslation();
  const { selectors } = useFileContext();

  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [results, setResults] = useState<WordCountResult[]>([]);

  const resetResults = useCallback(() => {
    setResults([]);
    setStatus("");
    setErrorMessage(null);
  }, []);

  const clearError = useCallback(() => setErrorMessage(null), []);

  const cancelOperation = useCallback(() => {
    if (isLoading) {
      setIsLoading(false);
      setStatus(t("operationCancelled", "Operation cancelled"));
    }
  }, [isLoading, t]);

  const undoOperation = useCallback(async () => {
    resetResults();
  }, [resetResults]);

  const executeOperation = useCallback(
    async (params: WordCountParameters, selectedFiles: StirlingFile[]) => {
      if (selectedFiles.length === 0) {
        setErrorMessage(t("noFileSelected", "No file loaded"));
        return;
      }

      setIsLoading(true);
      setStatus(t("wordCount.processing", "Counting words..."));
      setErrorMessage(null);
      setResults([]);

      try {
        const aggregated: WordCountResult[] = [];

        for (const file of selectedFiles) {
          const formData = new FormData();
          formData.append("fileInput", file);
          formData.append("includePerPage", String(params.includePerPage));

          try {
            const response = await apiClient.post(
              "/api/v1/analysis/word-count",
              formData,
            );
            aggregated.push({
              fileId: file.fileId,
              fileName: file.name,
              ...response.data,
              error: null,
            });
          } catch (error) {
            aggregated.push({
              fileId: file.fileId,
              fileName: file.name,
              wordCount: 0,
              characterCount: 0,
              characterCountNoSpaces: 0,
              lineCount: 0,
              error: extractErrorMessage(error),
            });
          }
        }

        setResults(aggregated);
        const anyError = aggregated.some((r) => r.error);
        if (anyError) {
          setErrorMessage(
            t("wordCount.error.partial", "Some files could not be processed."),
          );
        }
        setStatus(t("wordCount.status.complete", "Done"));
      } catch (e) {
        setErrorMessage(
          t("wordCount.error.unexpected", "Unexpected error during word count."),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  return useMemo<WordCountOperationHook>(
    () => ({
      files: [],
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
