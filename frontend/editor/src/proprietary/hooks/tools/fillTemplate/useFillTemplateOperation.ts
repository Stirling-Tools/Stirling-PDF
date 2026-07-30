import { useTranslation } from "react-i18next";
import { useToolOperation } from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import { fillTemplateOperationConfig } from "@app/hooks/tools/fillTemplate/fillTemplateOperationConfig";

export const useFillTemplateOperation = () => {
  const { t } = useTranslation();

  return useToolOperation({
    ...fillTemplateOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("fillTemplate.error.failed", "Failed to fill template"),
    ),
  });
};
