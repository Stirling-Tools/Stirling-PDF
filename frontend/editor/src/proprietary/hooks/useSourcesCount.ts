import { useEffect, useState } from "react";
import apiClient from "@app/services/apiClient";

interface SourcesCountResult {
  /** Connected sources for the caller's team; null if the fetch failed. */
  count: number | null;
  loading: boolean;
}

/**
 * Count of connected sources (policy/pipeline inputs) for the caller's team,
 * from the team-scoped, ungated GET /api/v1/sources. Used for the "Sources"
 * figure on the free Plan & Usage card.
 */
export function useSourcesCount(): SourcesCountResult {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<{ sources?: unknown[] }>("/api/v1/sources")
      .then((res) => {
        if (!cancelled) setCount(res.data?.sources?.length ?? 0);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { count, loading };
}
