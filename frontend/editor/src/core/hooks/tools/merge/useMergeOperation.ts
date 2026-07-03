import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  ToolOperationConfig,
  ToolType,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  MergeParameters,
  defaultParameters,
} from "@app/hooks/tools/merge/useMergeParameters";

const ENDPOINT = "/api/v1/general/merge-pdfs" satisfies ToolEndpoint;
type MergeApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the merge-pdfs request body. File-derived
// fields (clientFileIds) are appended by buildFormData, not here.
export const mergeToApiParams = (
  parameters: MergeParameters,
): MergeApiParams => ({
  // The UI owns file ordering, so the backend is always told to keep it.
  sortType: "orderProvided",
  removeCertSign: parameters.removeDigitalSignature ?? false,
  generateToc: parameters.generateTableOfContents ?? false,
});

// Reconstruct the tool's UI parameters from a merge-pdfs request body.
export const mergeFromApiParams = (
  apiParams: MergeApiParams,
): Partial<MergeParameters> => ({
  removeDigitalSignature: apiParams.removeCertSign ?? false,
  generateTableOfContents: apiParams.generateToc ?? false,
});

const buildFormData = (
  parameters: MergeParameters,
  files: File[],
): FormData => {
  const formData = objectToFormData(mergeToApiParams(parameters), {
    fileInput: files,
  });
  // Stable client file IDs, aligned with the fileInput order. Derived from the
  // files themselves, so it belongs to the file-appending step.
  const clientIds: string[] = files.map((f) =>
    String((f as { fileId?: string }).fileId || f.name),
  );
  formData.append("clientFileIds", JSON.stringify(clientIds));
  return formData;
};

// Operation configuration for automation
export const mergeOperationConfig: ToolOperationConfig<MergeParameters> = {
  toolType: ToolType.multiFile,
  buildFormData,
  toApiParams: mergeToApiParams,
  fromApiParams: mergeFromApiParams,
  operationType: "merge",
  endpoint: ENDPOINT,
  filePrefix: "merged_",
  defaultParameters,
};

export const useMergeOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<MergeParameters>({
    ...mergeOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("merge.error.failed", "An error occurred while merging the PDFs."),
    ),
  });
};
