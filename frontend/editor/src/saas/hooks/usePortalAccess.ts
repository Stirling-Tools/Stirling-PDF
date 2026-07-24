import { useEffect, useState } from "react";
import apiClient from "@app/services/apiClient";

// Module-level cache: the answer is per-login, not per-mount, so every
// consumer shares one /me request per page load.
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

function fetchPortalAccess(): Promise<boolean> {
  inflight ??= apiClient
    .get<{ user?: { portalAccess?: boolean } }>("/api/v1/auth/me")
    .then((res) => {
      cached = res.data.user?.portalAccess === true;
      return cached;
    })
    .catch(() => {
      // Backend unreachable or guest (401): no access now; allow a retry on
      // the next consumer mount rather than caching the failure forever.
      inflight = null;
      return false;
    });
  return inflight;
}

/**
 * Whether the current user can open the processor (admin portal), straight
 * from the backend (`/api/v1/auth/me` → `portalAccess`) — the same signal the
 * processor's own SaasPortalGate uses. The editor's Supabase auth context
 * can't answer this (it never fetches /me), so components that must mirror
 * processor access (e.g. the sidebar's editor⇄processor switcher) ask here.
 */
export function usePortalAccess(): boolean {
  const [access, setAccess] = useState(cached === true);
  useEffect(() => {
    if (cached !== null) return;
    let mounted = true;
    void fetchPortalAccess().then((v) => {
      if (mounted) setAccess(v);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return access;
}
