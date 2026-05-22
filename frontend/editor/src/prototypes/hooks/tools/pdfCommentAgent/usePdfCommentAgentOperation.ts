import { useTranslation } from "react-i18next";
import { useToolOperation } from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import { pdfCommentAgentOperationConfig } from "@app/hooks/tools/pdfCommentAgent/pdfCommentAgentOperationConfig";

export const usePdfCommentAgentOperation = () => {
  const { t } = useTranslation();

  return useToolOperation({
    ...pdfCommentAgentOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("pdfCommentAgent.error.failed", "Failed to generate comments"),
    ),
  });
};
