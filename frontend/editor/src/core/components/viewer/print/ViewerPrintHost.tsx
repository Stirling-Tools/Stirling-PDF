import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrintCapability } from "@embedpdf/plugin-print/react";
import { PrintDialog } from "@app/components/viewer/print/PrintDialog";
import {
  buildPrintJob,
  printFileName,
} from "@app/components/viewer/print/printJob";
import type { PrintSettings } from "@app/components/viewer/print/printJob";
import { useDocumentReady } from "@app/components/viewer/hooks/useDocumentReady";
import { useViewer } from "@app/contexts/ViewerContext";
import { objectToFormData } from "@app/hooks/tools/shared/toolApiMapping";
import apiClient from "@app/services/apiClient";
import { printPdfBlob } from "@app/services/printService";

export interface ViewerPrintHostProps {
  fileName?: string;
  /**
   * The platform prints through its own dialog, which owns page ranges and
   * annotation flattening, so the viewer cannot honour them itself.
   */
  systemPrintDialog?: boolean;
  /**
   * Whether the document's permissions allow printing. A host rendered outside
   * the print bridge has no other gate in front of it, so it defaults to
   * allowed and callers holding a forbidden document must pass false.
   */
  canPrint?: boolean;
}

/**
 * Identifies one print attempt. The token proves a completion still belongs to
 * the job that is running, and the controller ends the request behind it.
 */
interface PrintJobHandle {
  token: symbol;
  controller: AbortController;
}

/**
 * Owns the print dialog and answers the viewer's print action with it.
 *
 * The viewer prints what it renders, so anything laid out by the backend has to
 * be exported first and printed as its own document.
 */
export function ViewerPrintHost({
  fileName,
  systemPrintDialog = false,
  canPrint = true,
}: ViewerPrintHostProps) {
  const { t } = useTranslation();
  const { provides: print } = usePrintCapability();
  const { registerBridge, exportActions, activeFileId } = useViewer();
  const documentReady = useDocumentReady();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobRef = useRef<PrintJobHandle | null>(null);

  useEffect(() => {
    if (!documentReady || !canPrint) {
      return;
    }

    registerBridge("print", {
      state: {},
      api: {
        print: () => {
          setError(null);
          setOpen(true);
        },
      },
    });

    return () => {
      registerBridge("print", null);
    };
  }, [documentReady, registerBridge, canPrint]);

  // A document swap or an unmount makes any in-flight job stale: the bytes it
  // is about to hand to the printer belong to a document no longer open. The
  // active document's identity is what separates them, since two documents can
  // arrive under the same name.
  useEffect(
    () => () => {
      jobRef.current?.controller.abort();
      jobRef.current = null;
      // The abort makes that handle stale, so its own finally will not clear the
      // busy state the dropped job set.
      setBusy(false);
    },
    [activeFileId],
  );

  const handleClose = useCallback(() => {
    // Closing during preparation cancels it: nothing already queued, exported
    // or in flight may reach the printer afterwards.
    jobRef.current?.controller.abort();
    jobRef.current = null;
    setBusy(false);
    setOpen(false);
  }, []);

  const handlePrint = useCallback(
    async (settings: PrintSettings, pageCount: number) => {
      if (!canPrint || jobRef.current) {
        // A forbidden document must not start a job, and busy is a render old,
        // so the ref is what stops a duplicate start.
        return;
      }

      const handle: PrintJobHandle = {
        token: Symbol("print"),
        controller: new AbortController(),
      };
      jobRef.current = handle;
      setBusy(true);
      setError(null);

      const ownsJob = () => jobRef.current === handle;

      try {
        const job = buildPrintJob(settings, pageCount);
        if (job.kind === "viewer" && !systemPrintDialog && print) {
          print.print({
            pageRange: job.pageRange,
            includeAnnotations: job.includeAnnotations,
          });
          setOpen(false);
          return;
        }

        const name = fileName || "document.pdf";
        const buffer = await exportActions.saveAsCopy();
        if (!ownsJob()) {
          return;
        }
        // Only the export bridge carries the viewer's edits, and printing the
        // originally opened bytes instead would drop them without saying so.
        if (!buffer) {
          throw new Error(t("viewer.print.readFailed"));
        }
        const source = new File([buffer], name, { type: "application/pdf" });

        if (job.kind === "viewer") {
          await printPdfBlob(
            source,
            printFileName(name),
            handle.controller.signal,
          );
        } else {
          const formData = objectToFormData(job.request, { fileInput: source });
          const response = await apiClient.post<Blob>(job.endpoint, formData, {
            responseType: "blob",
            signal: handle.controller.signal,
          });
          if (!ownsJob()) {
            return;
          }
          if (response.data.size === 0) {
            throw new Error(t("viewer.print.emptyOutput"));
          }
          await printPdfBlob(
            response.data,
            printFileName(name, job.suffix),
            handle.controller.signal,
          );
        }

        if (!ownsJob()) {
          return;
        }
        setOpen(false);
      } catch (thrown) {
        if (!ownsJob()) {
          return;
        }
        console.error("[Print] Print failed", thrown);
        setError(
          thrown instanceof Error ? thrown.message : t("viewer.print.failed"),
        );
      } finally {
        if (ownsJob()) {
          jobRef.current = null;
          setBusy(false);
        }
      }
    },
    [canPrint, exportActions, fileName, print, systemPrintDialog, t],
  );

  return (
    <PrintDialog
      open={open}
      onClose={handleClose}
      onPrint={handlePrint}
      busy={busy}
      error={error}
      fileName={fileName ?? null}
      documentId={activeFileId}
      systemPrintDialog={systemPrintDialog}
      canPrint={canPrint}
    />
  );
}
