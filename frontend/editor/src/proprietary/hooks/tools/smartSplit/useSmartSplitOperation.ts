import { useTranslation } from "react-i18next";
import { useToolOperation } from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import { smartSplitOperationConfig } from "@app/hooks/tools/smartSplit/smartSplitOperationConfig";

export const useSmartSplitOperation = () => {
  const { t } = useTranslation();

  return useToolOperation({
    ...smartSplitOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("smartSplit.error.failed", "Failed to split document"),
    ),
  });
};
