import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import { ensureBackendReady } from "@app/services/backendReadinessGuard";
import { assertFilesNotBlocked } from "@app/services/policyFileGuard";
import { useEndpointEnabled } from "@app/hooks/useEndpointConfig";
import { useCreditCheck } from "@app/hooks/useCreditCheck";
import { useToolResources } from "@app/hooks/tools/shared/useToolResources";
import {
  buildOCRFormData,
  ocrOperationConfig,
  ocrResponseHandler,
} from "@app/hooks/tools/ocr/useOCROperation";
import { defaultParameters } from "@app/hooks/tools/ocr/useOCRParameters";
import { getAutoOcrLanguage } from "@app/utils/languageMapping";
import { extractErrorMessage } from "@app/utils/toolErrorHandler";
import { exportToBlob } from "@app/tools/pdfTextEditor/util/exportPdf";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import type { FileId } from "@app/types/file";

const OCR_ENDPOINT =
  (typeof ocrOperationConfig.endpoint === "function"
    ? ocrOperationConfig.endpoint(defaultParameters)
    : ocrOperationConfig.endpoint) ?? undefined;

interface EditorOcrOptions {
  store: EditorStore;
  fileName: string | null;
  fileId: FileId | null;
  onComplete: (file: File, isCurrent: () => boolean) => Promise<void>;
}

/** OCR the current editor bytes and only apply the result to the unchanged document. */
export function useEditorOcr({
  store,
  fileName,
  fileId,
  onComplete,
}: EditorOcrOptions) {
  const { t, i18n } = useTranslation();
  const { enabled } = useEndpointEnabled("ocr-pdf");
  const { checkCredits } = useCreditCheck("ocr", OCR_ENDPOINT);
  const { extractZipFiles } = useToolResources();
  const [running, setRunning] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const releaseLoadingRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      releaseLoadingRef.current?.();
      releaseLoadingRef.current = null;
      requestRef.current = null;
    };
  }, []);

  const runOcr = useCallback(async () => {
    const doc = store.document;
    if (
      !doc ||
      store.getState().loading ||
      requestRef.current ||
      !OCR_ENDPOINT ||
      enabled !== true
    )
      return;
    const token = store.currentLoadToken;
    const position = store.savedPosition();
    const ownsDocument = () =>
      store.isCurrentLoad(token) && store.document === doc;
    const isSameDocument = () =>
      mountedRef.current && requestRef.current === request && ownsDocument();
    const isCurrent = () =>
      isSameDocument() && store.savedPosition() === position;
    const request = new AbortController();
    requestRef.current = request;
    releaseLoadingRef.current = () => {
      if (ownsDocument()) store.setLoading(false);
    };
    setRunning(true);
    store.setLoading(true);
    store.setProgress({
      stage: t("pdfTextEditor.inspector.ocrRunning", "Recognizing text..."),
      current: 0,
      total: 0,
    });
    const unsubscribe = store.subscribe(() => {
      if (!isCurrent()) request.abort();
    });

    try {
      assertFilesNotBlocked([fileId ?? undefined]);
      const creditError = await checkCredits(OCR_ENDPOINT);
      if (!isCurrent()) return;
      if (creditError) throw new Error(creditError);
      if (!(await ensureBackendReady(OCR_ENDPOINT))) {
        throw new Error(
          t(
            "backendHealth.offline",
            "Embedded backend is offline. Please try again shortly.",
          ),
        );
      }
      if (!isCurrent()) return;
      const { data } = await apiClient.get<{ languages: string[] }>(
        "/api/v1/ui-data/ocr-pdf",
        { signal: request.signal },
      );
      if (!isCurrent()) return;
      const available = data.languages.filter((language) => language !== "osd");
      const language =
        getAutoOcrLanguage(i18n.language).find((candidate) =>
          available.includes(candidate),
        ) ?? (available.includes("eng") ? "eng" : available[0]);
      if (!language)
        throw new Error(
          t(
            "pdfTextEditor.inspector.ocrNoLanguages",
            "No OCR languages are installed on the server.",
          ),
        );
      const { blob, filename } = await exportToBlob(doc, fileName);
      if (!isCurrent()) return;
      const input = new File([blob], fileName ?? filename, {
        type: "application/pdf",
      });
      assertFilesNotBlocked([fileId ?? undefined]);
      const response = await apiClient.post<Blob>(
        OCR_ENDPOINT,
        buildOCRFormData(
          { ...defaultParameters, languages: [language] },
          input,
        ),
        { responseType: "blob", timeout: 0, signal: request.signal },
      );
      if (!isCurrent()) return;
      const outputs = await ocrResponseHandler(
        response.data,
        [input],
        extractZipFiles,
      );
      if (!isCurrent()) return;
      const pdfs = outputs.filter((file) => file.type === "application/pdf");
      if (pdfs.length !== 1 || pdfs[0].size === 0) {
        throw new Error(
          t(
            "pdfTextEditor.inspector.ocrInvalidResult",
            "OCR did not return a PDF. Please try again.",
          ),
        );
      }
      assertFilesNotBlocked([fileId ?? undefined]);
      await onComplete(pdfs[0], isCurrent);
    } catch (error) {
      if (isSameDocument()) store.setError(extractErrorMessage(error));
    } finally {
      unsubscribe();
      if (isSameDocument()) {
        if (store.savedPosition() !== position)
          store.setError(
            t(
              "pdfTextEditor.inspector.ocrDocumentChanged",
              "The document changed while OCR was running. Run OCR again to include your latest changes.",
            ),
          );
        store.setLoading(false);
      }
      requestRef.current = null;
      releaseLoadingRef.current = null;
      if (mountedRef.current) setRunning(false);
    }
  }, [
    store,
    enabled,
    fileId,
    fileName,
    checkCredits,
    i18n.language,
    extractZipFiles,
    onComplete,
    t,
  ]);

  return {
    runOcr,
    running,
    available: enabled,
  };
}
