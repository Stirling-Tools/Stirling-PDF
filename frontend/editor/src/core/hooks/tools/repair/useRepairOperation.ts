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
  RepairParameters,
  defaultParameters,
} from "@app/hooks/tools/repair/useRepairParameters";

const ENDPOINT = "/api/v1/misc/repair" satisfies ToolEndpoint;

// Repair takes only a file; there are no request parameters to map.
const { toApiParams, fromApiParams } = fileOnlyMapping();

export const buildRepairFormData = (
  _parameters: RepairParameters,
  file: File,
): FormData => objectToFormData(toApiParams(), { fileInput: file });

// Static configuration object
export const repairOperationConfig = defineSingleFileTool({
  buildFormData: buildRepairFormData,
  toApiParams,
  fromApiParams,
  operationType: "repair",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useRepairOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RepairParameters>({
    ...repairOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("repair.error.failed", "An error occurred while repairing the PDF."),
    ),
  });
};
