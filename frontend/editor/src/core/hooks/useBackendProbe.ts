import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@app/constants/app";
import { captureNetworkError } from "@app/services/analytics";

type BackendStatus = "up" | "starting" | "down";

interface BackendProbeState {
  status: BackendStatus;
  loginDisabled: boolean;
  loading: boolean;
}

// A single probe's raw verdict, before the startup grace window is applied.
// "unreachable" means the request never completed (backend slow/booting/down);
// "starting" means it answered but isn't ready yet.
type ProbeVerdict = "up" | "starting" | "unreachable";

// Keep treating an unreachable backend as "starting" (a reassuring "still
// starting up" screen) for this long before declaring it genuinely "down".
const STARTUP_GRACE_MS = 20_000;
// Auto-poll backoff bounds while the backend isn't up yet. Fast at first so the
// screen advances quickly when the backend finishes booting, then slower so we
// keep polling for recovery without hammering the network.
const MIN_POLL_DELAY_MS = 1_000;
const MAX_POLL_DELAY_MS = 8_000;

/**
 * Lightweight backend probe that avoids global axios interceptors.
 * Used on auth screens to decide whether to show login, anonymous mode, a
 * "backend starting up" message, or a "backend unreachable" error.
 *
 * The probe auto-polls with backoff: an unreachable backend stays "starting"
 * during a grace window (and while still booting) before it is reported as
 * "down", so a slow or restarting backend no longer lands users on a dead-end
 * error screen. Polling continues after "down" so the screen auto-recovers.
 */
export function useBackendProbe() {
  const [state, setState] = useState<BackendProbeState>({
    status: "starting",
    loginDisabled: false,
    loading: true,
  });

  // Start of the current not-up streak, used to apply the startup grace window.
  const streakStartRef = useRef<number | null>(null);
  // Ensure we only forward a genuine "down" to error tracking once per streak.
  const capturedDownRef = useRef(false);

  const probeOnce = useCallback(async (): Promise<{
    verdict: ProbeVerdict;
    loginDisabled: boolean;
  }> => {
    const statusUrl = `${BASE_PATH || ""}/api/v1/info/status`;
    const loginUrl = `${BASE_PATH || ""}/api/v1/proprietary/ui-data/login`;

    let verdict: ProbeVerdict;
    let loginDisabled = false;

    try {
      const res = await fetch(statusUrl, { method: "GET", cache: "no-store" });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        verdict = data && data.status === "UP" ? "up" : "starting";
      } else if (res.status === 404 || res.status === 503) {
        verdict = "starting";
      } else {
        verdict = "unreachable";
      }
    } catch {
      verdict = "unreachable";
    }

    if (verdict === "up") {
      return { verdict, loginDisabled };
    }

    // Fallback: proprietary login endpoint to detect disabled login and backend availability
    try {
      const res = await fetch(loginUrl, { method: "GET", cache: "no-store" });
      if (res.ok) {
        verdict = "up";
        const data = await res.json().catch(() => null);
        if (data && data.enableLogin === false) {
          loginDisabled = true;
        }
      } else if (res.status === 404) {
        // Endpoint missing usually means login disabled
        verdict = "up";
        loginDisabled = true;
      } else if (res.status === 503) {
        verdict = "starting";
      } else {
        verdict = "unreachable";
      }
    } catch {
      // keep previous inferred verdict (unreachable/starting)
    }

    return { verdict, loginDisabled };
  }, []);

  const probe = useCallback(async (): Promise<BackendProbeState> => {
    const { verdict, loginDisabled } = await probeOnce();

    if (verdict === "up") {
      streakStartRef.current = null;
      capturedDownRef.current = false;
      const next: BackendProbeState = {
        status: "up",
        loginDisabled,
        loading: false,
      };
      setState(next);
      return next;
    }

    // Not up: start (or continue) the not-up streak.
    const now = Date.now();
    if (streakStartRef.current == null) {
      streakStartRef.current = now;
    }
    const elapsed = now - streakStartRef.current;

    // A reachable-but-booting backend is always "starting". An unreachable one
    // is optimistically "starting" during the grace window, then "down".
    let status: BackendStatus = "starting";
    if (verdict === "unreachable" && elapsed >= STARTUP_GRACE_MS) {
      status = "down";
      if (!capturedDownRef.current) {
        capturedDownRef.current = true;
        captureNetworkError(new Error("Backend unreachable"), {
          endpoint: `${BASE_PATH || ""}/api/v1/info/status`,
          status: null,
          context: "backend_probe",
        });
      }
    }

    const next: BackendProbeState = { status, loginDisabled, loading: false };
    setState(next);
    return next;
  }, [probeOnce]);

  // Auto-poll with backoff until the backend is up (or login is disabled, which
  // means we can proceed anonymously). Keep polling after "down" so the screen
  // recovers on its own once the backend comes back.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let delay = MIN_POLL_DELAY_MS;

    const loop = async () => {
      const result = await probe();
      if (cancelled) return;
      if (result.status === "up" || result.loginDisabled) return;
      delay = Math.min(delay * 2, MAX_POLL_DELAY_MS);
      timer = window.setTimeout(() => void loop(), delay);
    };

    void loop();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [probe]);

  return {
    ...state,
    probe,
  };
}
