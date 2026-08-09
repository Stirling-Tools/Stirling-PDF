import type { MemberAvatarSource } from "@portal/api/memberAvatars";
import { supabase } from "@app/auth/supabase";

/** Same bucket the editor's account page writes to. */
const PROFILE_BUCKET = "profile-pictures";

/** Signed-URL lifetime for roster avatars; the roster is refetched well inside this. */
const AVATAR_URL_TTL_SECONDS = 60 * 60;

/**
 * SaaS build: avatar keys are Supabase auth uuids and the picture lives at `<uuid>/avatar`. Storage
 * RLS (migration V34) limits reads to teammates; paths outside the team error and are dropped.
 */
export const memberAvatars: MemberAvatarSource = {
  async resolve(keys: string[]): Promise<Record<string, string>> {
    const ids = Array.from(new Set(keys)).filter(Boolean);
    if (ids.length === 0) return {};
    try {
      const { data, error } = await supabase.storage
        .from(PROFILE_BUCKET)
        .createSignedUrls(
          ids.map((id) => `${id}/avatar`),
          AVATAR_URL_TTL_SECONDS,
        );
      if (error || !data) return {};
      const byId: Record<string, string> = {};
      for (const entry of data) {
        if (entry.error || !entry.signedUrl || !entry.path) continue;
        byId[entry.path.split("/")[0]] = entry.signedUrl;
      }
      return byId;
    } catch {
      return {};
    }
  },
};
