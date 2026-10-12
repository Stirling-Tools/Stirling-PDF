import { useEffect, useRef, useState } from "react";
import { PdfPermissionFlag } from "@embedpdf/models";
import { getDocumentBytes } from "@app/services/documentBytesCache";
import { runPdfiumScan } from "@app/services/pdfiumScanQueue";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocument,
} from "@app/services/pdfiumService";
import { LARGE_PDF_PARSE_LIMIT } from "@app/utils/thumbnailUtils";
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
 * Documents at the browser parsing size limit require manual settings.
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

    const readPermissions = async () => {
      try {
        if (file.size >= LARGE_PDF_PARSE_LIMIT) {
          throw new Error("PDF exceeds the browser parsing size limit");
        }
        const permissions = await runPdfiumScan(async () => {
          if (signal.cancelled) return;
          const bytes = await getDocumentBytes(file);
          if (signal.cancelled) return;
          const module = await getPdfiumModule();
          if (signal.cancelled) return;
          const docPtr = await openRawDocument(bytes);
          try {
            if (signal.cancelled) return;
            // Owner access must not hide the document's stored user restrictions.
            return module.FPDF_GetDocUserPermissions(docPtr);
          } finally {
            closeDocAndFreeBuffer(module, docPtr);
          }
        });
        if (signal.cancelled || permissions === undefined) return;

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
        if (!signal.cancelled) {
          initializedFile.current = file;
          setState({ file, status: "error" });
        }
      }
    };

    void readPermissions();

    return () => {
      signal.cancelled = true;
    };
  }, [file, setParameters, enabled]);

  return {
    isLoading:
      enabled && !!file && (state.file !== file || state.status === "loading"),
    hasError: enabled && state.file === file && state.status === "error",
  };
}
