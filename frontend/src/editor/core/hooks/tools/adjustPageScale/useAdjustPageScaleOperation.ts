import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  defineSingleFileTool,
} from "@editor/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@editor/utils/toolErrorHandler";
import {
  AdjustPageScaleParameters,
  defaultParameters,
} from "@editor/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";
import {
  buildAdjustPageScaleFormData,
  adjustPageScaleToApiParams,
  adjustPageScaleFromApiParams,
  ADJUST_PAGE_SCALE_ENDPOINT,
} from "@editor/hooks/tools/adjustPageScale/adjustPageScaleFormData";

export {
  buildAdjustPageScaleFormData,
  adjustPageScaleToApiParams,
  adjustPageScaleFromApiParams,
};

export const adjustPageScaleOperationConfig = defineSingleFileTool({
  buildFormData: buildAdjustPageScaleFormData,
  toApiParams: adjustPageScaleToApiParams,
  fromApiParams: adjustPageScaleFromApiParams,
  operationType: "scalePages",
  endpoint: ADJUST_PAGE_SCALE_ENDPOINT,
  defaultParameters,
});

export const useAdjustPageScaleOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AdjustPageScaleParameters>({
    ...adjustPageScaleOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "adjustPageScale.error.failed",
        "An error occurred while adjusting the page scale.",
      ),
    ),
  });
};
