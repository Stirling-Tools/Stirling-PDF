import { AdjustPageScaleParameters } from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";

export const buildAdjustPageScaleFormData = (
  parameters: AdjustPageScaleParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("scaleFactor", parameters.scaleFactor.toString());
  formData.append("pageSize", parameters.pageSize);
  formData.append("orientation", parameters.orientation);
  return formData;
};
