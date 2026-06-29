import { ToolType } from "@app/hooks/tools/shared/useToolOperation";

/** Classify-and-tag takes no user parameters — it only needs the file. */
export type ClassifyParameters = Record<string, never>;

export const defaultParameters: ClassifyParameters = {};

// Static function shared by the registry/automation executor. The backend reads
// only the file: it classifies via the AI engine and writes the result into the
// StirlingPDFClassification metadata field.
export const buildClassifyFormData = (
  _parameters: ClassifyParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  return formData;
};

export const classifyOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildClassifyFormData,
  operationType: "classify",
  endpoint: "/api/v1/ai/tools/classify-and-tag",
  multiFileEndpoint: false,
  defaultParameters,
} as const;
