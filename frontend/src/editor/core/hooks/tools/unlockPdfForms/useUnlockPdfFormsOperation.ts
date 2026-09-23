import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  defineSingleFileTool,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  fileOnlyMapping,
  objectToFormData,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  UnlockPdfFormsParameters,
  defaultParameters,
} from "@app/hooks/tools/unlockPdfForms/useUnlockPdfFormsParameters";

const ENDPOINT = "/api/v1/misc/unlock-pdf-forms" satisfies ToolEndpoint;

// Unlock PDF forms takes only a file; there are no request parameters to map.
const { toApiParams, fromApiParams } = fileOnlyMapping();

// Static function that can be used by both the hook and automation executor
export const buildUnlockPdfFormsFormData = (
  _parameters: UnlockPdfFormsParameters,
  file: File,
): FormData => objectToFormData(toApiParams(), { fileInput: file });

// Static configuration object
export const unlockPdfFormsOperationConfig = defineSingleFileTool({
  buildFormData: buildUnlockPdfFormsFormData,
  toApiParams,
  fromApiParams,
  operationType: "unlockPDFForms",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useUnlockPdfFormsOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<UnlockPdfFormsParameters>({
    ...unlockPdfFormsOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "unlockPDFForms.error.failed",
        "An error occurred while unlocking PDF forms.",
      ),
    ),
  });
};
