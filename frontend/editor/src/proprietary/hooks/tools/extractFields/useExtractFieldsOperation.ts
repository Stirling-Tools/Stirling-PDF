import { useTranslation } from "react-i18next";
import { useToolOperation } from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import { extractFieldsOperationConfig } from "@app/hooks/tools/extractFields/extractFieldsOperationConfig";

export const useExtractFieldsOperation = () => {
  const { t } = useTranslation();

  return useToolOperation({
    ...extractFieldsOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("extractFields.error.failed", "Failed to extract fields"),
    ),
  });
};
