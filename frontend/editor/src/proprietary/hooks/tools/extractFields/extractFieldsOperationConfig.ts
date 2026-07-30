import apiClient from "@app/services/apiClient";
import {
  defineCustomTool,
  CustomProcessorResult,
} from "@app/hooks/tools/shared/toolOperationTypes";
import { deriveName } from "@app/hooks/tools/shared/docparseFilenames";
import { rowsToSchemaString } from "@app/hooks/tools/extractFields/fieldsSchema";
import {
  ExtractFieldsParameters,
  defaultParameters,
} from "@app/hooks/tools/extractFields/useExtractFieldsParameters";

// The JSON variant; the plain /extract-fields form is the pipeline shape.
export const EXTRACT_FIELDS_ENDPOINT = "/api/v1/docparse/extract-fields/json";

/** One extracted field in the backend's extraction report. */
export interface ExtractedField {
  name: string;
  value: unknown;
  confidence: number;
  citations?: { page: number; bbox?: number[] | null; quote?: string }[];
}

export interface ExtractFieldsResult {
  mode: string;
  fields: ExtractedField[];
  overallConfidence?: number;
}

export const buildExtractFieldsFormData = (
  parameters: ExtractFieldsParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("fieldsSchema", rowsToSchemaString(parameters.fields));
  formData.append("mode", parameters.mode);
  if (parameters.instructions.trim()) {
    formData.append("instructions", parameters.instructions.trim());
  }
  return formData;
};

/** POST the PDF + schema; keep the extraction report as a JSON result file. */
const processExtractFields = async (
  parameters: ExtractFieldsParameters,
  files: File[],
): Promise<CustomProcessorResult> => {
  if (files.length === 0) return { files: [] };

  const [inputFile] = files;
  const response = await apiClient.post<ExtractFieldsResult>(
    EXTRACT_FIELDS_ENDPOINT,
    buildExtractFieldsFormData(parameters, inputFile),
  );

  const resultFile = new File(
    [JSON.stringify(response.data, null, 2)],
    deriveName(inputFile.name, ".fields.json"),
    { type: "application/json" },
  );
  return { files: [resultFile] };
};

export const extractFieldsOperationConfig =
  defineCustomTool<ExtractFieldsParameters>({
    operationType: "extractFields",
    endpoint: EXTRACT_FIELDS_ENDPOINT,
    customProcessor: processExtractFields,
    defaultParameters,
  });
