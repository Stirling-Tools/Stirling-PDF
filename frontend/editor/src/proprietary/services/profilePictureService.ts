/**
 * Self-hosted profile pictures. The app authenticates with a bearer token, which an `<img src>`
 * would not carry, so avatars come through the API client as blobs (own) or data URLs (rosters).
 */
import apiClient from "@app/services/apiClient";

/** Matches ProfilePictureService.MAX_UPLOAD_BYTES on the backend. */
export const MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024;

export const PROFILE_PICTURE_ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * Ids per batch request. The ids travel in the query string, and a few thousand of them overflow the
 * 8KB request line nginx allows by default - which 414s and wipes every avatar on the page. Also
 * keeps each request under the server's own 500-id cap.
 */
const BATCH_SIZE = 200;

/**
 * The signed-in user's avatar as an object URL, or null when they have none.
 *
 * Rethrows anything that is not a definitive answer, so the caller can retry a transient failure
 * instead of caching "no avatar" for the rest of the session.
 */
export async function fetchOwnProfilePicture(): Promise<string | null> {
  try {
    const response = await apiClient.get<Blob>("/api/v1/user/profile-picture", {
      responseType: "blob",
      suppressErrorToast: true,
      skipAuthRedirect: true,
    });
    return URL.createObjectURL(response.data);
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response
      ?.status;
    // 404 (no picture) and 401/403 (login disabled or signed out) are settled answers; a 5xx or a
    // dropped connection is not.
    if (status === 404 || status === 401 || status === 403) return null;
    throw err;
  }
}

export async function uploadProfilePicture(file: Blob): Promise<void> {
  const formData = new FormData();
  formData.append("file", file, "avatar.png");
  await apiClient.post("/api/v1/user/profile-picture", formData, {
    suppressErrorToast: true,
  });
}

export async function removeProfilePicture(): Promise<void> {
  await apiClient.delete("/api/v1/user/profile-picture", {
    suppressErrorToast: true,
  });
}

/**
 * Thumbnails for a roster, keyed by user id. Ids the caller isn't allowed to see are simply absent
 * from the response, so the row falls back to initials.
 */
export async function fetchProfilePictureThumbnails(
  userIds: Array<number | string>,
): Promise<Record<string, string>> {
  const ids = Array.from(new Set(userIds.map(String))).filter(Boolean);
  if (ids.length === 0) return {};

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    chunks.push(ids.slice(i, i + BATCH_SIZE));
  }
  const results = await Promise.all(chunks.map(fetchThumbnailChunk));
  return Object.assign({}, ...results);
}

async function fetchThumbnailChunk(
  ids: string[],
): Promise<Record<string, string>> {
  try {
    const response = await apiClient.get<Record<string, string>>(
      "/api/v1/user/profile-pictures",
      {
        params: { userIds: ids.join(",") },
        suppressErrorToast: true,
        skipAuthRedirect: true,
      },
    );
    return response.data ?? {};
  } catch {
    // Avatars are decoration: a failure here must never break the roster.
    return {};
  }
}
