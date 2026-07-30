import JSZip from "jszip";
import apiClient from "@app/services/apiClient";
import {
  defineCustomTool,
  CustomProcessorResult,
} from "@app/hooks/tools/shared/toolOperationTypes";
import {
  SmartSplitParameters,
  defaultParameters,
} from "@app/hooks/tools/smartSplit/useSmartSplitParameters";

export const SMART_SPLIT_ENDPOINT = "/api/v1/docparse/smart-split";

export const buildSmartSplitFormData = (
  parameters: SmartSplitParameters,
  file: File,
): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("rule", parameters.rule.trim());
  formData.append("maxParts", String(parameters.maxParts));
  return formData;
};

/** POST the PDF + rule; unpack the returned ZIP into the sub-PDFs. */
const processSmartSplit = async (
  parameters: SmartSplitParameters,
  files: File[],
): Promise<CustomProcessorResult> => {
  if (files.length === 0) return { files: [] };

  const [inputFile] = files;
  const response = await apiClient.post<Blob>(
    SMART_SPLIT_ENDPOINT,
    buildSmartSplitFormData(parameters, inputFile),
    { responseType: "blob" },
  );

  const zip = await JSZip.loadAsync(response.data);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const parts = await Promise.all(
    entries.map(
      async (entry) =>
        new File([await entry.async("blob")], entry.name.split("/").pop()!, {
          type: "application/pdf",
        }),
    ),
  );
  // One input becomes N parts, so filename-based input mapping cannot apply.
  return { files: parts, consumedAllInputs: true };
};

export const smartSplitOperationConfig = defineCustomTool<SmartSplitParameters>(
  {
    operationType: "smartSplit",
    endpoint: SMART_SPLIT_ENDPOINT,
    customProcessor: processSmartSplit,
    defaultParameters,
  },
);
