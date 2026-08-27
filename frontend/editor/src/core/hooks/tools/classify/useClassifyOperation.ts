import { defineSingleFileTool } from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";

/**
 * Classification as an ordinary pipeline step.
 *
 * <p>The tool reads a window of the document, asks the AI engine what kind of document it is, and
 * writes the verdict into the PDF's metadata. It has no interactive UI - there is nothing for a
 * user to set beyond whether to redo work already done - so it exists in the registry purely so a
 * pipeline can name it, the same way the Classification policy always could.
 */
const ENDPOINT = "/api/v1/ai/tools/classify-and-label" satisfies ToolEndpoint;
type ClassifyApiParams = ToolApiParams[typeof ENDPOINT];

export interface ClassifyParameters {
  /**
   * Classify again even when the document already carries a verdict. Off by default: re-running
   * costs a second engine call, and a document that has been classified has nothing new to say.
   */
  reclassify: boolean;
}

export const defaultParameters: ClassifyParameters = { reclassify: false };

export const classifyToApiParams = (
  parameters: ClassifyParameters,
): ClassifyApiParams => ({ reclassify: parameters.reclassify });

export const classifyFromApiParams = (
  apiParams: ClassifyApiParams,
): Partial<ClassifyParameters> => ({
  reclassify: apiParams.reclassify ?? defaultParameters.reclassify,
});

export const buildClassifyFormData = (
  parameters: ClassifyParameters,
  file: File,
): FormData =>
  objectToFormData(classifyToApiParams(parameters), { fileInput: file });

export const classifyOperationConfig = defineSingleFileTool({
  buildFormData: buildClassifyFormData,
  toApiParams: classifyToApiParams,
  fromApiParams: classifyFromApiParams,
  operationType: "classify",
  endpoint: ENDPOINT,
  defaultParameters,
});
