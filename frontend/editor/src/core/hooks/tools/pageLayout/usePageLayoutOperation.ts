import { useTranslation } from "react-i18next";
import {
  ToolType,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  PageLayoutParameters,
  defaultParameters,
} from "@app/hooks/tools/pageLayout/usePageLayoutParameters";

export const buildPageLayoutFormData = (
  parameters: PageLayoutParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("mode", String(parameters.mode));
  formData.append("pagesPerSheet", String(parameters.pagesPerSheet));
  formData.append("rows", String(parameters.rows));
  formData.append("cols", String(parameters.cols));
  formData.append("orientation", String(parameters.orientation));
  formData.append("arrangement", String(parameters.arrangement));
  formData.append("readingDirection", String(parameters.readingDirection));
  formData.append("innerMargin", String(parameters.innerMargin ?? 0));
  formData.append("topMargin", String(parameters.topMargin ?? 0));
  formData.append("bottomMargin", String(parameters.bottomMargin ?? 0));
  formData.append("leftMargin", String(parameters.leftMargin ?? 0));
  formData.append("rightMargin", String(parameters.rightMargin ?? 0));
  formData.append("addBorder", String(parameters.addBorder));
  formData.append("borderWidth", String(parameters.borderWidth ?? 1));
  return formData;
};

export const pageLayoutOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildPageLayoutFormData,
  operationType: "pageLayout",
  endpoint: "/api/v1/general/multi-page-layout",
  defaultParameters,
} as const;

export const usePageLayoutOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<PageLayoutParameters>({
    ...pageLayoutOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "pageLayout.error.failed",
        "An error occurred while creating the multi-page layout.",
      ),
    ),
  });
};
