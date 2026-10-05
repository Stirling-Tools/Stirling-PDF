import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "@app/services/supabaseClient";

const PROFILE_BUCKET = "profile-pictures";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/** Re-sign well before expiry, so a long-lived roster never shows a dead image. */
const REFRESH_INTERVAL_MS = 45 * 60 * 1000;

/** Ids are interpolated into a storage path, so only a bare uuid is ever sent. */
const SUPABASE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface HasSupabaseId {
  supabaseId?: string | null;
}

/**
 * Signed avatar URLs for a set of team members, keyed by Supabase id. Ids the bucket refuses are
 * absent, so callers fall back to initials.
 *
 * Keys off the set of ids rather than the member array: rosters poll on a timer, and an
 * unchanged roster must not re-sign on every tick.
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
        .filter((id): id is string => Boolean(id) && SUPABASE_ID.test(id!))
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
        // The bucket is private and RLS keys off auth.uid(), so signing while signed out is
        // refused every time. Skipping it also keeps tests off the network.
        const { data: auth } = await client.auth.getSession();
        if (cancelled || request !== requestRef.current) return;
        if (!auth?.session) {
          setUrls({});
          return;
        }

        const paths: string[] = [];
        for (const id of ids) {
          if (!SUPABASE_ID.test(id)) {
            throw new Error("Refusing to sign a non-uuid avatar path");
          }
          paths.push(`${id}/avatar`);
        }

        const { data, error } = await client.storage
          .from(PROFILE_BUCKET)
          .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

        if (cancelled || error || request !== requestRef.current) return;

        const next: Record<string, string> = {};
        for (const entry of data ?? []) {
          // Per-path outcome: a member with no stored picture carries an error and no signedUrl.
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
