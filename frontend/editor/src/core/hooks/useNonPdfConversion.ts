import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { alert } from "@app/components/toast";
import { useFileActions } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { convertProcessor } from "@app/hooks/tools/convert/useConvertOperation";
import type { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import { extractAxiosErrorMessageAsync } from "@app/services/httpErrorUtils";
import { getNonPdfConversionParameters } from "@app/utils/nonPdfConversion";
import type { NonPdfConversionPlan } from "@app/utils/nonPdfConversion";

export type NonPdfConversionStatus = "idle" | "converting" | "error";

interface UseNonPdfConversionOptions {
  file: File;
  plan: NonPdfConversionPlan;
  /** Called once the converted PDF is in the workspace and active. */
  onConverted?: () => void;
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
  const abortRef = useRef<AbortController | null>(null);
  const convertingRef = useRef(false);
  // React unmounts this panel as soon as the converted file becomes the active
  // document, and the cleanup below aborts the request. That abort is not a
  // user cancellation: the conversion already succeeded, so it must not
  // suppress the success toast.
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    convertingRef.current = false;
    cancelledRef.current = false;
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
    cancelledRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
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

    const controller = new AbortController();
    abortRef.current = controller;
    convertingRef.current = true;
    cancelledRef.current = false;
    setStatus("converting");
    setErrorMessage(null);

    try {
      const result = await convertProcessor(parameters, [file], {
        signal: controller.signal,
        suppressErrorToast: true,
      });
      if (cancelledRef.current) return;

      const convertedFile = result.files[0];
      if (!convertedFile) {
        throw new Error(
          t("viewer.nonPdf.convertEmpty", "The server returned no document."),
        );
      }

      const added = await actions.addFiles([convertedFile], {
        selectFiles: true,
        derivedFromTool: true,
      });
      // Cancelling during the save is the only reason to stop here; the
      // signal itself is aborted by our own unmount on success.
      if (cancelledRef.current) return;

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
    } catch (error) {
      if (controller.signal.aborted || axios.isCancel(error)) return;

      const { body } = await extractAxiosErrorMessageAsync(error);
      setErrorMessage(
        body ||
          t(
            "viewer.nonPdf.convertError",
            "The file could not be converted. Try again, or open it in the Convert tool.",
          ),
      );
      setStatus("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      convertingRef.current = false;
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
