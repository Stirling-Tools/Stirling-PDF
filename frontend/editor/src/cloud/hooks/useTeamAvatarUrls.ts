import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@app/services/supabaseClient";

const PROFILE_BUCKET = "profile-pictures";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Re-sign well before expiry, so a long-lived settings modal never shows a dead image. */
const REFRESH_INTERVAL_MS = 45 * 60 * 1000;

interface HasSupabaseId {
  supabaseId?: string | null;
}

/**
 * Signed avatar URLs for a set of team members, keyed by Supabase id.
 *
 * Reading these depends on the teammate storage policy in the SaaS repo
 * (20260923000000_team_readable_profile_pictures). Without it every path is refused and the map
 * comes back empty, which callers render as initials.
 *
 * The roster polls every 10s, so this deliberately keys off the set of ids rather than the member
 * array: an unchanged roster must not re-sign on every poll.
 */
export function useTeamAvatarUrls(
  members: readonly HasSupabaseId[],
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const requestRef = useRef(0);

  const idKey = useMemo(
    () =>
      members
        .map((m) => m.supabaseId)
        .filter((id): id is string => Boolean(id))
        .sort()
        .join(","),
    [members],
  );

  useEffect(() => {
    if (!idKey || !isSupabaseConfigured || !supabase) {
      setUrls({});
      return;
    }

    const client = supabase;
    const ids = idKey.split(",");
    let cancelled = false;

    const sign = async () => {
      const request = ++requestRef.current;
      try {
        const { data, error } = await client.storage
          .from(PROFILE_BUCKET)
          .createSignedUrls(
            ids.map((id) => `${id}/avatar`),
            SIGNED_URL_TTL_SECONDS,
          );

        if (cancelled || error || request !== requestRef.current) return;

        const next: Record<string, string> = {};
        for (const entry of data ?? []) {
          // Per-path outcome: a member who never uploaded a picture, and every member if the
          // teammate policy is missing, comes back with an error and no signedUrl.
          if (!entry.signedUrl || !entry.path?.endsWith("/avatar")) continue;
          next[entry.path.slice(0, -"/avatar".length)] = entry.signedUrl;
        }
        setUrls(next);
      } catch {
        if (!cancelled) setUrls({});
      }
    };

    void sign();
    const timer = window.setInterval(() => void sign(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [idKey]);

  return urls;
}
