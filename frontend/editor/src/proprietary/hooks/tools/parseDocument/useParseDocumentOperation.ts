import { useTranslation } from "react-i18next";
import { useToolOperation } from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import { parseDocumentOperationConfig } from "@app/hooks/tools/parseDocument/parseDocumentOperationConfig";

export const useParseDocumentOperation = () => {
  const { t } = useTranslation();

  return useToolOperation({
    ...parseDocumentOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("parseDocument.error.failed", "Failed to parse document"),
    ),
  });
};
