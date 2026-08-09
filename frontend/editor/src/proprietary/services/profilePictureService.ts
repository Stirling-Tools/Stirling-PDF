/**
 * Self-hosted profile pictures. The app authenticates with a bearer token, which an `<img src>`
 * would not carry, so avatars come through the API client as blobs (own) or data URLs (rosters).
 */
import apiClient from "@app/services/apiClient";

/** Matches ProfilePictureService.MAX_UPLOAD_BYTES on the backend. */
export const MAX_PROFILE_PICTURE_BYTES = 5 * 1024 * 1024;

export const PROFILE_PICTURE_ACCEPT = "image/png,image/jpeg,image/webp";

/** The signed-in user's avatar as an object URL, or null when they have none. */
export async function fetchOwnProfilePicture(): Promise<string | null> {
  try {
    const response = await apiClient.get<Blob>("/api/v1/user/profile-picture", {
      responseType: "blob",
      suppressErrorToast: true,
      skipAuthRedirect: true,
    });
    return URL.createObjectURL(response.data);
  } catch {
    // 404 (no picture) and 401 (login disabled / signed out) are both "no avatar".
    return null;
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
