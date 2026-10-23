import { useEffect, useRef, useState } from "react";
import {
  getPdfAccess,
  ensureLocalPdfAccess,
} from "@editor/services/pdfAccessService";
import { PdfPermissionFlag } from "@embedpdf/models";

import {
  defaultParameters,
  type ChangePermissionsParametersHook,
} from "@editor/hooks/tools/changePermissions/useChangePermissionsParameters";

type ExtractionStatus = "idle" | "loading" | "loaded" | "error";

/**
 * Prefills restrictions for one FileContext document.
 * Pass no file for a batch to preserve the current settings without inspecting PDFs.
 * Disable while processing or reviewing results to preserve the operation state.
 * Failed reads keep manual settings until another file is selected.
 * Cached stored permissions include restrictions hidden by owner authentication.
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
    const cancellation = new AbortController();

    const readPermissions = async () => {
      try {
        const { permissions } =
          getPdfAccess(file) ??
          (await ensureLocalPdfAccess(file, cancellation.signal));
        if (cancellation.signal.aborted) return;

        const prevented = (flag: PdfPermissionFlag) =>
          (permissions & flag) === 0;

        setParameters({
          preventAssembly: prevented(PdfPermissionFlag.AssembleDocument),
          preventExtractContent: prevented(PdfPermissionFlag.CopyContents),
          preventExtractForAccessibility: prevented(
            PdfPermissionFlag.ExtractForAccessibility,
          ),
          preventFillInForm: prevented(PdfPermissionFlag.FillForms),
          preventModify: prevented(PdfPermissionFlag.ModifyContents),
          preventModifyAnnotations: prevented(
            PdfPermissionFlag.ModifyAnnotations,
          ),
          preventPrinting: prevented(PdfPermissionFlag.Print),
          preventPrintingFaithful: prevented(
            PdfPermissionFlag.PrintHighQuality,
          ),
        });
        initializedFile.current = file;
        setState({ file, status: "loaded" });
      } catch {
        if (!cancellation.signal.aborted) {
          initializedFile.current = file;
          setState({ file, status: "error" });
        }
      }
    };

    void readPermissions();

    return () => {
      cancellation.abort();
    };
  }, [file, setParameters, enabled]);

  return {
    isLoading:
      enabled && !!file && (state.file !== file || state.status === "loading"),
    hasError: enabled && state.file === file && state.status === "error",
  };
}
