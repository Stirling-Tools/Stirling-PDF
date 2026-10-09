import { useEffect, useRef, useState } from "react";
import {
  PermissionFlag,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import {
  defaultParameters,
  type ChangePermissionsParametersHook,
} from "@app/hooks/tools/changePermissions/useChangePermissionsParameters";

type ExtractionStatus = "idle" | "loading" | "loaded" | "error";

/**
 * Prefills restrictions for one FileContext document.
 * Pass no file for a batch to preserve the current settings without inspecting PDFs.
 * Disable while processing or reviewing results to preserve the operation state.
 * Failed reads keep manual settings until another file is selected.
 */
export function usePermissionExtraction(
  file: File | undefined,
  setParameters: ChangePermissionsParametersHook["setParameters"],
  enabled: boolean,
) {
  const initializedFile = useRef<File | undefined>(undefined);
  const [state, setState] = useState<{
    file: File | undefined;
    status: ExtractionStatus;
  }>({ file: undefined, status: "idle" });

  useEffect(() => {
    if (!enabled) return;
    if (file && initializedFile.current === file) return;

    initializedFile.current = undefined;
    if (!file) {
      setState({ file, status: "idle" });
      return;
    }

    setParameters(defaultParameters);
    setState({ file, status: "loading" });
    const signal = { cancelled: false };
    const url = URL.createObjectURL(file);
    let document: PDFDocumentProxy | undefined;

    const readPermissions = async () => {
      try {
        document = await pdfWorkerManager.createDocument(url, {
          signal,
          openTimeoutMs: 30_000,
        });
        if (signal.cancelled) return;

        const permissions = await document.getPermissions();
        if (signal.cancelled) return;

        // PDF.js returns null when the document has no permission restrictions.
        const prevented = (flag: number) =>
          permissions !== null && !permissions.includes(flag);

        setParameters({
          preventAssembly: prevented(PermissionFlag.ASSEMBLE),
          preventExtractContent: prevented(PermissionFlag.COPY),
          preventExtractForAccessibility: prevented(
            PermissionFlag.COPY_FOR_ACCESSIBILITY,
          ),
          preventFillInForm: prevented(PermissionFlag.FILL_INTERACTIVE_FORMS),
          preventModify: prevented(PermissionFlag.MODIFY_CONTENTS),
          preventModifyAnnotations: prevented(
            PermissionFlag.MODIFY_ANNOTATIONS,
          ),
          preventPrinting: prevented(PermissionFlag.PRINT),
          preventPrintingFaithful: prevented(PermissionFlag.PRINT_HIGH_QUALITY),
        });
        initializedFile.current = file;
        setState({ file, status: "loaded" });
      } catch {
        if (!signal.cancelled) {
          initializedFile.current = file;
          setState({ file, status: "error" });
        }
      } finally {
        if (document) await pdfWorkerManager.destroyDocument(document);
        URL.revokeObjectURL(url);
      }
    };

    void readPermissions();

    return () => {
      signal.cancelled = true;
      if (document) void pdfWorkerManager.destroyDocument(document);
    };
  }, [file, setParameters, enabled]);

  return {
    isLoading:
      enabled && !!file && (state.file !== file || state.status === "loading"),
    hasError: enabled && state.file === file && state.status === "error",
  };
}
