import { useTranslation } from "react-i18next";
import {
  ToolType,
  type ToolOperationConfig,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import { EditTableOfContentsParameters } from "@app/hooks/tools/editTableOfContents/useEditTableOfContentsParameters";
import {
  hydrateBookmarkPayload,
  serializeBookmarkNodes,
  type BookmarkPayload,
} from "@app/utils/editTableOfContents";

const ENDPOINT =
  "/api/v1/general/edit-table-of-contents" satisfies ToolEndpoint;
type EditTableOfContentsApiParams = ToolApiParams[typeof ENDPOINT];

// bookmarkData is a string in the backend model even though it carries JSON, so
// the serialized bookmark tree is JSON-encoded into that string here.
export const editTableOfContentsToApiParams = (
  parameters: EditTableOfContentsParameters,
): EditTableOfContentsApiParams => ({
  replaceExisting: parameters.replaceExisting,
  bookmarkData: JSON.stringify(serializeBookmarkNodes(parameters.bookmarks)),
});

export const editTableOfContentsFromApiParams = (
  apiParams: EditTableOfContentsApiParams,
): Partial<EditTableOfContentsParameters> => {
  const result: Partial<EditTableOfContentsParameters> = {
    replaceExisting: apiParams.replaceExisting,
  };

  // bookmarkData carries JSON in a string field, so a stored step
  // could hold malformed or non-array content. Degrade to leaving bookmarks unset.
  if (apiParams.bookmarkData !== undefined) {
    try {
      const payload = JSON.parse(apiParams.bookmarkData) as BookmarkPayload[];
      if (Array.isArray(payload)) {
        result.bookmarks = hydrateBookmarkPayload(payload);
      }
    } catch (error) {
      console.warn(
        `editTableOfContents: could not parse bookmarkData; ` +
          `leaving bookmarks unset. Error: ${error}`,
      );
    }
  }

  return result;
};

const buildFormData = (
  parameters: EditTableOfContentsParameters,
  file: File,
): FormData =>
  objectToFormData(editTableOfContentsToApiParams(parameters), {
    fileInput: file,
  });

export const editTableOfContentsOperationConfig: ToolOperationConfig<EditTableOfContentsParameters> =
  {
    toolType: ToolType.singleFile,
    operationType: "editTableOfContents",
    endpoint: ENDPOINT,
    buildFormData,
    toApiParams: editTableOfContentsToApiParams,
    fromApiParams: editTableOfContentsFromApiParams,
  };

export const useEditTableOfContentsOperation = () => {
  const { t } = useTranslation();
  return useToolOperation<EditTableOfContentsParameters>({
    ...editTableOfContentsOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "editTableOfContents.error.failed",
        "Failed to update the table of contents",
      ),
    ),
  });
};
