import { useEffect, useRef, useState } from "react";

interface FetchSuccess<K extends string, V> {
  key: K;
  status: "fulfilled";
  value: V;
}
interface FetchFailure<K extends string> {
  key: K;
  status: "rejected";
  reason: unknown;
}
type FetchOutcome<K extends string, V> = FetchSuccess<K, V> | FetchFailure<K>;

export interface ScopedFetchCache<K extends string, V> {
  /** Latest successfully fetched value per key; absent until first success. */
  values: Partial<Record<K, V>>;
  /** True while any requested key is being (re)fetched. */
  loading: boolean;
}

/**
 * A keyed async cache for search sources: each requested key is fetched at
 * most once per TTL window, concurrent requests for the same key share one
 * in-flight promise, and results from a superseded request generation are
 * dropped (though their in-flight promises are still awaited by the next
 * generation rather than re-fired).
 *
 * Failed keys are stamped like successes — a deployment without that endpoint
 * answers the same way on every keystroke, so hammering it per keypress buys
 * nothing. The failure is logged at debug level and retried after the TTL.
 *
 * `fetchKey` identity is the cache's world-view: when it changes (e.g. a tier
 * change producing a different fetcher), every key is considered stale.
 */
export function useScopedFetchCache<K extends string, V>(
  requestedKeys: readonly K[],
  fetchKey: (key: K) => Promise<V>,
  ttlMs: number,
): ScopedFetchCache<K, V> {
  const [values, setValues] = useState<Partial<Record<K, V>>>({});
  const [loading, setLoading] = useState(false);
  const fetchedAtRef = useRef(new Map<K, number>());
  const inFlightRef = useRef(new Map<K, Promise<FetchOutcome<K, V>>>());
  const requestIdRef = useRef(0);
  const fetcherRef = useRef(fetchKey);

  useEffect(() => {
    if (fetcherRef.current !== fetchKey) {
      fetcherRef.current = fetchKey;
      fetchedAtRef.current.clear();
      inFlightRef.current.clear();
    }

    if (requestedKeys.length === 0) {
      requestIdRef.current += 1;
      setLoading(false);
      return;
    }

    const now = Date.now();
    const staleKeys = requestedKeys.filter(
      (key) => now - (fetchedAtRef.current.get(key) ?? 0) >= ttlMs,
    );
    if (staleKeys.length === 0) {
      setLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);

    void Promise.all(
      staleKeys.map((key) => {
        const existing = inFlightRef.current.get(key);
        if (existing) return existing;

        const request = fetchKey(key)
          .then((value) => ({ key, status: "fulfilled" as const, value }))
          .catch((reason) => ({ key, status: "rejected" as const, reason }))
          .finally(() => {
            if (inFlightRef.current.get(key) === request) {
              inFlightRef.current.delete(key);
            }
          });
        inFlightRef.current.set(key, request);
        return request;
      }),
    ).then((results) => {
      if (requestIdRef.current !== requestId) return;

      const fetchedAt = Date.now();
      for (const result of results) {
        // Stamp failures too — see the hook doc.
        fetchedAtRef.current.set(result.key, fetchedAt);
        if (result.status === "rejected") {
          console.debug(
            "[useScopedFetchCache] source unavailable:",
            result.key,
            result.reason,
          );
        }
      }

      const fulfilled = results.filter(
        (result): result is FetchSuccess<K, V> => result.status === "fulfilled",
      );
      if (fulfilled.length > 0) {
        setValues((current) => {
          const next = { ...current };
          for (const result of fulfilled) next[result.key] = result.value;
          return next;
        });
      }

      setLoading(false);
    });

    return () => {
      if (requestIdRef.current === requestId) {
        requestIdRef.current += 1;
      }
    };
  }, [requestedKeys, fetchKey, ttlMs]);

  return { values, loading };
}
