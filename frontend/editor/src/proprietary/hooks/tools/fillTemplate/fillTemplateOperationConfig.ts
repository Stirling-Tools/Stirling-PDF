import apiClient from "@app/services/apiClient";
import {
  defineCustomTool,
  CustomProcessorResult,
} from "@app/hooks/tools/shared/toolOperationTypes";
import { deriveName } from "@app/hooks/tools/shared/docparseFilenames";
import {
  FillTemplateParameters,
  defaultParameters,
} from "@app/hooks/tools/fillTemplate/useFillTemplateParameters";

export const FILL_TEMPLATE_ENDPOINT = "/api/v1/docparse/fill-template";

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const buildFillTemplateFormData = (
  parameters: FillTemplateParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("templateFile", file);
  formData.append("data", parameters.dataJson.trim());
  return formData;
};

/** POST the DOCX template + data; the filled DOCX comes straight back. */
const processFillTemplate = async (
  parameters: FillTemplateParameters,
  files: File[],
): Promise<CustomProcessorResult> => {
  if (files.length === 0) return { files: [] };

  const [templateFile] = files;
  const response = await apiClient.post<Blob>(
    FILL_TEMPLATE_ENDPOINT,
    buildFillTemplateFormData(parameters, templateFile),
    { responseType: "blob" },
  );

  const resultFile = new File(
    [response.data],
    deriveName(templateFile.name, "-filled.docx"),
    { type: DOCX_TYPE },
  );
  return { files: [resultFile] };
};

export const fillTemplateOperationConfig =
  defineCustomTool<FillTemplateParameters>({
    operationType: "fillTemplate",
    endpoint: FILL_TEMPLATE_ENDPOINT,
    customProcessor: processFillTemplate,
    defaultParameters,
  });
