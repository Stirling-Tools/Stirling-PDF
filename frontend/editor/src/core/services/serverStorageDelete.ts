import apiClient from "@app/services/apiClient";

/** Where a delete should remove the file from. */
export type DeleteScope = "device" | "cloud" | "everywhere";

/**
 * Delete a file from server storage. Backend: DELETE /api/v1/storage/files/{id}
 * (owner-only). Treats 404 as already-deleted so double-deletes don't error.
 */
export async function deleteServerFile(remoteId: number): Promise<void> {
  try {
    await apiClient.delete(`/api/v1/storage/files/${remoteId}`);
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response
      ?.status;
    if (status === 404) return; // already gone on the server
    throw err;
  }
}
