import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelPairing,
  fetchPairingStatus,
  startPairing,
  type PairingView,
} from "@portal/api/link";

/**
 * Drives the device-grant pairing shown in the connect modal.
 *
 * <p>One second-ticking timer does two jobs: it keeps the "expires in" display
 * honest and it advances the pairing whenever the interval SaaS asked for has
 * elapsed. The local backend also enforces that interval upstream, so a fast
 * client here cannot hammer SaaS.
 *
 * <p>Polling stops the moment the phase is terminal. `linked` fires `onLinked`
 * exactly once, guarded by a ref, because the caller uses it to refresh link
 * state and close the dialog.
 */

const MIN_INTERVAL_SECONDS = 3;

export interface UsePairing {
  view: PairingView | null;
  /** Seconds until the code stops working; null when there is no live code. */
  secondsLeft: number | null;
  /** True while a start request is in flight. */
  starting: boolean;
  error: string | null;
  /** Begin (or restart) a pairing. */
  restart: () => Promise<void>;
  /** Abandon the pairing and clear local state. */
  abandon: () => Promise<void>;
}

function secondsUntil(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Number.isNaN(ms) ? null : Math.max(0, Math.floor(ms / 1000));
}

export function usePairing(
  active: boolean,
  onLinked?: () => void | Promise<void>,
): UsePairing {
  const [view, setView] = useState<PairingView | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const linkedFired = useRef(false);
  const lastPolled = useRef(0);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const apply = useCallback(
    (next: PairingView) => {
      if (!mounted.current) return;
      setView(next);
      setSecondsLeft(secondsUntil(next.expiresAt));
      if (next.phase === "linked" && !linkedFired.current) {
        linkedFired.current = true;
        void onLinked?.();
      }
    },
    [onLinked],
  );

  const restart = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      apply(await startPairing());
      lastPolled.current = Date.now();
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (mounted.current) setStarting(false);
    }
  }, [apply]);

  const abandon = useCallback(async () => {
    try {
      await cancelPairing();
    } catch {
      // Abandoning is best effort; the SaaS-side request expires on its own.
    }
    if (mounted.current) {
      setView(null);
      setSecondsLeft(null);
    }
  }, []);

  // On open: adopt whatever pairing this deployment already has in flight (any
  // replica may have started it) and only begin a new one when there is none.
  useEffect(() => {
    if (!active) return;
    linkedFired.current = false;
    let cancelled = false;
    void (async () => {
      try {
        const current = await fetchPairingStatus();
        if (cancelled) return;
        if (current.phase === "waiting" || current.phase === "linked") {
          apply(current);
          lastPolled.current = Date.now();
        } else {
          await restart();
        }
      } catch (e) {
        if (!cancelled && mounted.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, apply, restart]);

  // Read the fields out first so the timer depends on the values it actually uses.
  // Depending on `view` itself would tear down and rebuild the interval on every
  // poll response, since each one is a new object.
  const phase = view?.phase;
  const expiresAt = view?.expiresAt ?? null;
  const intervalSeconds = view?.intervalSeconds ?? 0;

  useEffect(() => {
    if (!active || phase !== "waiting") return;
    const intervalMs = Math.max(MIN_INTERVAL_SECONDS, intervalSeconds) * 1000;

    const tick = setInterval(() => {
      setSecondsLeft(secondsUntil(expiresAt));
      if (busy.current || Date.now() - lastPolled.current < intervalMs) return;
      busy.current = true;
      lastPolled.current = Date.now();
      void fetchPairingStatus()
        .then(apply)
        .catch(() => {
          // A dropped poll is not worth surfacing: the next tick retries, and
          // the phase only changes when SaaS says so.
        })
        .finally(() => {
          busy.current = false;
        });
    }, 1000);
    return () => clearInterval(tick);
  }, [active, phase, expiresAt, intervalSeconds, apply]);

  return { view, secondsLeft, starting, error, restart, abandon };
}
