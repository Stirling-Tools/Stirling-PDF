import apiClient from "@editor/services/apiClient";
import type { BookmarkPayload } from "@editor/utils/editTableOfContents";

/** Uses the stored copy when available: reading bookmarks is a read-only query. */
export const buildBookmarkFormData = (
  file: File,
  serverFileId?: string,
): FormData => {
  const formData = new FormData();
  if (serverFileId) {
    formData.append("fileId", serverFileId);
  } else {
    formData.append("fileInput", file);
  }
  return formData;
};

export const extractBookmarks = async (
  file: File,
  serverFileId?: string,
): Promise<BookmarkPayload[]> => {
  const response = await apiClient.post(
    "/api/v1/general/extract-bookmarks",
    buildBookmarkFormData(file, serverFileId),
  );

  return response.data as BookmarkPayload[];
};
