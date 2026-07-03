import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  ToolType,
  type ToolOperationConfig,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  type OverlayPdfsParameters,
  defaultParameters,
} from "@app/hooks/tools/overlayPdfs/useOverlayPdfsParameters";

const ENDPOINT = "/api/v1/general/overlay-pdfs" satisfies ToolEndpoint;
type OverlayPdfsApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the overlay-pdfs request body. The
// overlay documents are actual File uploads sent as repeated `overlayFiles`
// fields (see buildFormData), so `overlayFiles` here is an empty array: the real
// uploads are appended separately and an empty array serializes to no fields.
export const overlayPdfsToApiParams = (
  parameters: OverlayPdfsParameters,
): OverlayPdfsApiParams => {
  const apiParams: OverlayPdfsApiParams = {
    overlayFiles: [],
    overlayMode: parameters.overlayMode,
    overlayPosition: parameters.overlayPosition,
  };

  // Counts are only relevant for FixedRepeatOverlay; the server accepts repeated
  // 'counts' fields.
  if (parameters.overlayMode === "FixedRepeatOverlay") {
    apiParams.counts = parameters.counts || [];
  }

  return apiParams;
};

// Reconstruct the tool's UI parameters from an overlay-pdfs request body. The
// overlay File uploads cannot be recovered from the request model.
export const overlayPdfsFromApiParams = (
  apiParams: OverlayPdfsApiParams,
): Partial<OverlayPdfsParameters> => ({
  overlayMode: apiParams.overlayMode,
  overlayPosition: apiParams.overlayPosition,
  counts: apiParams.counts ?? defaultParameters.counts,
});

const buildFormData = (
  parameters: OverlayPdfsParameters,
  file: File,
): FormData =>
  objectToFormData(overlayPdfsToApiParams(parameters), {
    fileInput: file,
    overlayFiles: parameters.overlayFiles || [],
  });

export const overlayPdfsOperationConfig: ToolOperationConfig<OverlayPdfsParameters> =
  {
    toolType: ToolType.singleFile,
    buildFormData,
    toApiParams: overlayPdfsToApiParams,
    fromApiParams: overlayPdfsFromApiParams,
    operationType: "overlayPdfs",
    endpoint: ENDPOINT,
  };

export const useOverlayPdfsOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<OverlayPdfsParameters>({
    ...overlayPdfsOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "overlay-pdfs.error.failed",
        "An error occurred while overlaying PDFs.",
      ),
    ),
  });
};
