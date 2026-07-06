import { useTranslation } from "react-i18next";
import {
  ToolType,
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
  SingleLargePageParameters,
  defaultParameters,
} from "@app/hooks/tools/singleLargePage/useSingleLargePageParameters";

const ENDPOINT = "/api/v1/general/pdf-to-single-page" satisfies ToolEndpoint;

// Single large page takes only a file; there are no request parameters to map.
const { toApiParams, fromApiParams } = fileOnlyMapping();

// Static function that can be used by both the hook and automation executor
export const buildSingleLargePageFormData = (
  _parameters: SingleLargePageParameters,
  file: File,
): FormData => objectToFormData(toApiParams(), { fileInput: file });

// Static configuration object
export const singleLargePageOperationConfig = defineSingleFileTool({
  toolType: ToolType.singleFile,
  buildFormData: buildSingleLargePageFormData,
  toApiParams,
  fromApiParams,
  operationType: "pdfToSinglePage",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useSingleLargePageOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<SingleLargePageParameters>({
    ...singleLargePageOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "pdfToSinglePage.error.failed",
        "An error occurred while converting to single page.",
      ),
    ),
  });
};
