import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  defineSingleFileTool,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  fileOnlyMapping,
  objectToFormData,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  RepairParameters,
  defaultParameters,
} from "@app/hooks/tools/repair/useRepairParameters";
import { REPAIR_ENDPOINT } from "@app/constants/toolEndpoints";

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
  endpoint: REPAIR_ENDPOINT,
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
