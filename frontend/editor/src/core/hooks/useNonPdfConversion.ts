import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { alert } from "@app/components/toast";
import { useFileActions } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { convertProcessor } from "@app/hooks/tools/convert/useConvertOperation";
import type { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import { extractAxiosErrorMessageAsync } from "@app/services/httpErrorUtils";
import { focusPdfViewerWhenReady } from "@app/utils/focusPdfViewer";
import { getNonPdfConversionParameters } from "@app/utils/nonPdfConversion";
import type { NonPdfConversionPlan } from "@app/utils/nonPdfConversion";

export type NonPdfConversionStatus = "idle" | "converting" | "error";

interface UseNonPdfConversionOptions {
  file: File;
  plan: NonPdfConversionPlan;
  /** Called once the converted PDF is in the workspace and active. */
  onConverted?: () => void;
}

interface ActiveConversion {
  controller: AbortController;
  cancelled: boolean;
  /** The request succeeded; unmounting no longer means the user cancelled. */
  adding: boolean;
}

export interface NonPdfConversionController {
  status: NonPdfConversionStatus;
  errorMessage: string | null;
  parameters: ConvertParameters;
  updateParameter: <K extends keyof ConvertParameters>(
    key: K,
    value: ConvertParameters[K],
  ) => void;
  convert: () => Promise<void>;
  cancel: () => void;
  dismissError: () => void;
}

/**
 * Converts the open file in place instead of routing through the Convert tool, which would
 * consume the source file. The original stays in the workspace and the converted PDF becomes
 * the active document when the server responds.
 */
export function useNonPdfConversion({
  file,
  plan,
  onConverted,
}: UseNonPdfConversionOptions): NonPdfConversionController {
  const { t } = useTranslation();
  const { actions } = useFileActions();
  const { setActiveFileId } = useViewer();
  const [status, setStatus] = useState<NonPdfConversionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parameters, setParameters] = useState<ConvertParameters>(() =>
    getNonPdfConversionParameters(file.name, plan),
  );
  // One request object per conversion. Cancellation is stored on the request,
  // not in a shared ref, so a stale request cannot read the newer request's
  // state or clear the newer request's "converting" guard.
  const requestRef = useRef<ActiveConversion | null>(null);
  const convertingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const request = requestRef.current;
      if (request) {
        // A successful request unmounts this panel as addFiles selects the PDF.
        // Only an unmount before that point is a cancellation.
        if (!request.adding) request.cancelled = true;
        request.controller.abort();
      }
      requestRef.current = null;
      convertingRef.current = false;
    };
  }, []);

  useEffect(() => {
    const request = requestRef.current;
    if (request) {
      request.cancelled = true;
      request.controller.abort();
    }
    requestRef.current = null;
    convertingRef.current = false;
    setStatus("idle");
    setErrorMessage(null);
    setParameters(getNonPdfConversionParameters(file.name, plan));
  }, [file, plan]);

  const updateParameter = useCallback(
    <K extends keyof ConvertParameters>(
      key: K,
      value: ConvertParameters[K],
    ) => {
      setParameters((previous) => ({ ...previous, [key]: value }));
    },
    [],
  );

  const cancel = useCallback(() => {
    const request = requestRef.current;
    if (request) {
      request.cancelled = true;
      request.controller.abort();
    }
    requestRef.current = null;
    convertingRef.current = false;
    setStatus("idle");
    setErrorMessage(null);
  }, []);

  const dismissError = useCallback(() => {
    setStatus("idle");
    setErrorMessage(null);
  }, []);

  const convert = useCallback(async () => {
    if (convertingRef.current) return;

    const request = {
      controller: new AbortController(),
      cancelled: false,
      adding: false,
    };
    requestRef.current = request;
    convertingRef.current = true;
    setStatus("converting");
    setErrorMessage(null);

    try {
      const result = await convertProcessor(parameters, [file], {
        signal: request.controller.signal,
        suppressErrorToast: true,
      });
      if (request.cancelled) return;

      const convertedFile = result.files[0];
      if (!convertedFile) {
        throw new Error(
          t("viewer.nonPdf.convertEmpty", "The server returned no document."),
        );
      }

      request.adding = true;
      const added = await actions.addFiles([convertedFile], {
        selectFiles: true,
        derivedFromTool: true,
      });
      if (request.cancelled) return;

      const addedFile = added[0];
      if (!addedFile) {
        throw new Error(
          t(
            "viewer.nonPdf.convertNotAdded",
            "The converted PDF could not be added to the workspace.",
          ),
        );
      }

      setActiveFileId(addedFile.fileId);

      alert({
        alertType: "success",
        title: t("viewer.nonPdf.convertSuccessTitle", "Converted to PDF"),
        body: t(
          "viewer.nonPdf.convertSuccessBody",
          "{{name}} is ready. Your original {{format}} file is still in the workspace.",
          { name: addedFile.name, format: plan.formatLabel },
        ),
      });

      if (mountedRef.current) {
        setStatus("idle");
        onConverted?.();
      }

      // The panel unmounts as soon as the PDF is active (and preview mode
      // clears here), so focus the destination after those swaps.
      focusPdfViewerWhenReady();
    } catch (error) {
      if (
        request.cancelled ||
        request.controller.signal.aborted ||
        axios.isCancel(error)
      ) {
        return;
      }

      const { body } = await extractAxiosErrorMessageAsync(error);
      if (request.cancelled) return;
      setErrorMessage(
        body ||
          t(
            "viewer.nonPdf.convertError",
            "The file could not be converted. Try again, or open it in the Convert tool.",
          ),
      );
      setStatus("error");
    } finally {
      // A stale request must not clear the guard for the request that
      // replaced it; only the active request owns that state.
      if (requestRef.current === request) {
        requestRef.current = null;
        convertingRef.current = false;
      }
    }
  }, [
    actions,
    file,
    onConverted,
    parameters,
    plan.formatLabel,
    setActiveFileId,
    t,
  ]);

  return {
    status,
    errorMessage,
    parameters,
    updateParameter,
    convert,
    cancel,
    dismissError,
  };
}
