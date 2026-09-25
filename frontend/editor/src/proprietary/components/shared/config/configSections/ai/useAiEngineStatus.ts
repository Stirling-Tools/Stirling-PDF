import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "@app/services/apiClient";

/** Shape of GET /api/v1/ai/status. */
export interface AiEngineStatusData {
  enabled: boolean;
  reachable: boolean;
  latencyMs?: number | null;
  /** Null when the probe could not answer, which is not the same as a refusal. */
  authenticated?: boolean | null;
  smartModel?: string | null;
  fastModel?: string | null;
  error?: string | null;
  /** Cloud mode only: did the Stirling Cloud host answer its public status endpoint. */
  cloudUp?: boolean | null;
  /** Cloud mode only: does that deployment lend its AI to linked servers. */
  cloudSharingEnabled?: boolean | null;
}

/** What the card paints. `degraded` is reachable-but-refusing, the case /health cannot see. */
export type AiEngineHealth = "loading" | "off" | "down" | "degraded" | "ok";

export function healthOf(
  status: AiEngineStatusData | null,
  loading: boolean,
): AiEngineHealth {
  if (loading && !status) return "loading";
  if (!status || !status.enabled) return "off";
  if (!status.reachable) return "down";
  // Only an explicit refusal is degraded; an unanswered probe must not paint a warning.
  if (status.authenticated === false) return "degraded";
  return "ok";
}

/**
 * Fetches the status once on open and again on demand, never on a timer; skipped while AI is off.
 * Tracks when it last answered so the card can say how stale it is.
 */
export function useAiEngineStatus(enabled: boolean) {
  const [status, setStatus] = useState<AiEngineStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  // Guards against a slow earlier request resolving after a newer one and winning.
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setStatus(null);
      setCheckedAt(null);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    try {
      const response =
        await apiClient.get<AiEngineStatusData>("/api/v1/ai/status");
      if (id !== requestId.current) return;
      setStatus(response.data);
    } catch (_error) {
      if (id !== requestId.current) return;
      // A failed probe is itself a status: the backend could not be asked.
      setStatus({ enabled: true, reachable: false });
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setCheckedAt(Date.now());
      }
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, checkedAt, refresh };
}

/** Coarse "14s ago" for the status line; exact enough for a value that refreshes on demand. */
export function formatAge(
  checkedAt: number | null,
  now: number,
  t: (key: string, fallback: string, opts?: Record<string, unknown>) => string,
): string | null {
  if (checkedAt == null) return null;
  const seconds = Math.max(0, Math.round((now - checkedAt) / 1000));
  if (seconds < 5) return t("admin.settings.ai.status.justNow", "just now");
  if (seconds < 60)
    return t("admin.settings.ai.status.secondsAgo", "{{count}}s ago", {
      count: seconds,
    });
  const minutes = Math.round(seconds / 60);
  return t("admin.settings.ai.status.minutesAgo", "{{count}}m ago", {
    count: minutes,
  });
}

/**
 * Whether this server is linked to a Stirling account, which is what makes cloud AI selectable.
 * Its own hook rather than part of the status call: link state is a property of the server, not of
 * the engine, and the AI page is not the only thing that would want it.
 */
export function useAccountLinked() {
  const [linked, setLinked] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    // /linked, not /status: status is owner-only, and any admin can open this page.
    apiClient
      .get<{ linked?: boolean }>("/api/v1/account-link/linked", {
        suppressErrorToast: true,
      })
      .then((response) => {
        if (live) setLinked(response.data?.linked ?? false);
      })
      // A build without account linking answers 404 here; that is "not linked", not an error.
      .catch(() => {
        if (live) setLinked(false);
      });
    return () => {
      live = false;
    };
  }, []);

  return linked;
}
