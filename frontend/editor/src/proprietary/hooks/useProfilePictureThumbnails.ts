/**
 * Roster avatars: one batch request per distinct set of user ids. Ids the signed-in user may not
 * see come back absent, so those rows keep their initials.
 */
import { useEffect, useMemo, useState } from "react";
import { fetchProfilePictureThumbnails } from "@app/services/profilePictureService";

export function useProfilePictureThumbnails(
  userIds: Array<number | string>,
): Record<string, string> {
  // Stable across renders that re-derive the same ids, so the effect doesn't refetch on every pass.
  const key = useMemo(
    () =>
      Array.from(new Set(userIds.map(String)))
        .sort()
        .join(","),
    [userIds],
  );
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!key) {
      setThumbnails({});
      return;
    }
    let cancelled = false;
    void fetchProfilePictureThumbnails(key.split(",")).then((result) => {
      if (!cancelled) setThumbnails(result);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return thumbnails;
}
