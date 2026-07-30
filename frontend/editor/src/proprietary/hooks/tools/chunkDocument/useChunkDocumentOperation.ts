import { useTranslation } from "react-i18next";
import { useToolOperation } from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import { chunkDocumentOperationConfig } from "@app/hooks/tools/chunkDocument/chunkDocumentOperationConfig";

export const useChunkDocumentOperation = () => {
  const { t } = useTranslation();

  return useToolOperation({
    ...chunkDocumentOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("chunkDocument.error.failed", "Failed to chunk document"),
    ),
  });
};
