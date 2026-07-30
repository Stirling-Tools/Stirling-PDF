import apiClient from "@app/services/apiClient";
import {
  defineCustomTool,
  CustomProcessorResult,
} from "@app/hooks/tools/shared/toolOperationTypes";
import { deriveName } from "@app/hooks/tools/shared/docparseFilenames";
import {
  ParseDocumentParameters,
  defaultParameters,
} from "@app/hooks/tools/parseDocument/useParseDocumentParameters";

// Not part of the generated ToolEndpoint union; DocParse is an optional addon.
export const PARSE_DOCUMENT_ENDPOINT = "/api/v1/docparse/parse-document";

export const buildParseDocumentFormData = (
  parameters: ParseDocumentParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("mode", parameters.mode);
  formData.append("withOcr", String(parameters.withOcr));
  formData.append("outputFormat", parameters.outputFormat);
  return formData;
};

/** POST the PDF; wrap the JSON or markdown result as a downloadable file. */
const processParseDocument = async (
  parameters: ParseDocumentParameters,
  files: File[],
): Promise<CustomProcessorResult> => {
  if (files.length === 0) return { files: [] };

  const [inputFile] = files;
  const response = await apiClient.post<Blob>(
    PARSE_DOCUMENT_ENDPOINT,
    buildParseDocumentFormData(parameters, inputFile),
    { responseType: "blob" },
  );

  const isMarkdown = parameters.outputFormat === "markdown";
  const resultFile = new File(
    [response.data],
    deriveName(inputFile.name, isMarkdown ? ".md" : ".parsed.json"),
    { type: isMarkdown ? "text/markdown" : "application/json" },
  );
  return { files: [resultFile] };
};

export const parseDocumentOperationConfig =
  defineCustomTool<ParseDocumentParameters>({
    operationType: "parseDocument",
    endpoint: PARSE_DOCUMENT_ENDPOINT,
    customProcessor: processParseDocument,
    defaultParameters,
  });
