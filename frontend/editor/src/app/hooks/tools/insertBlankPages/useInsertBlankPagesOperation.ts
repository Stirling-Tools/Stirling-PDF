import { useTranslation } from "react-i18next";
import {
  defineSingleFileTool,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  InsertBlankPagesParameters,
  defaultInsertBlankPagesParameters,
} from "@app/hooks/tools/insertBlankPages/useInsertBlankPagesParameters";

const ENDPOINT = "/api/v1/general/insert-blank-pages" satisfies ToolEndpoint;
type InsertBlankPagesApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the insert-blank-pages request body.
export const insertBlankPagesToApiParams = (
  parameters: InsertBlankPagesParameters,
): InsertBlankPagesApiParams => {
  const apiParams: InsertBlankPagesApiParams = {};
  if (parameters.position !== undefined) {
    apiParams.position = parameters.position;
  }
  if (parameters.count !== undefined) {
    apiParams.count = parameters.count;
  }
  if (parameters.pageSize) {
    apiParams.pageSize = parameters.pageSize;
  }
  return apiParams;
};

// Reconstruct the tool's UI parameters from an insert-blank-pages request body.
export const insertBlankPagesFromApiParams = (
  apiParams: InsertBlankPagesApiParams,
): Partial<InsertBlankPagesParameters> => ({
  position: apiParams.position ?? defaultInsertBlankPagesParameters.position,
  count: apiParams.count ?? defaultInsertBlankPagesParameters.count,
  pageSize: apiParams.pageSize ?? defaultInsertBlankPagesParameters.pageSize,
});

const buildFormData = (
  parameters: InsertBlankPagesParameters,
  file: File,
): FormData =>
  objectToFormData(insertBlankPagesToApiParams(parameters), {
    fileInput: file,
  });

export const insertBlankPagesOperationConfig = defineSingleFileTool({
  buildFormData,
  toApiParams: insertBlankPagesToApiParams,
  fromApiParams: insertBlankPagesFromApiParams,
  operationType: "insertBlankPages",
  endpoint: ENDPOINT,
});

export const useInsertBlankPagesOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<InsertBlankPagesParameters>({
    ...insertBlankPagesOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("insertBlankPages.error.failed", "Failed to insert blank pages"),
    ),
  });
};
