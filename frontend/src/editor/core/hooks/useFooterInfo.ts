import { useQuery } from "@tanstack/react-query";
import { fetchFooterInfo, type FooterInfo } from "@editor/api/config";
import { qk } from "@editor/query/keys";
import { CONFIG_STALE_TIME } from "@editor/query/staleTime";

export type { FooterInfo };

const FALLBACK: FooterInfo = { analyticsEnabled: false };

/** Public footer config, shared by Footer and the admin legal section. */
export function useFooterInfo() {
  const { data, isPending, error } = useQuery({
    queryKey: qk.footerInfo(),
    queryFn: fetchFooterInfo,
    staleTime: CONFIG_STALE_TIME,
  });

  return {
    // Callers render legal links off this, so a failure must still yield an object.
    footerInfo: data ?? (error ? FALLBACK : null),
    loading: isPending,
    error: (error as Error | null) ?? null,
  };
}
