import { useQuery } from "@tanstack/react-query";
import { fetchFooterInfo, type FooterInfo } from "@app/api/config";
import { qk } from "@app/query/keys";
import { CONFIG_STALE_TIME } from "@app/query/staleTime";

export type { FooterInfo };

/** Analytics off is the safe read when the server can't be asked. */
const FALLBACK: FooterInfo = { analyticsEnabled: false };

/**
 * Public footer configuration. Two mount sites (Footer, admin LegalSection)
 * share one cache entry.
 */
export function useFooterInfo() {
  const { data, isPending, error } = useQuery({
    queryKey: qk.footerInfo(),
    queryFn: fetchFooterInfo,
    staleTime: CONFIG_STALE_TIME,
  });

  return {
    // Callers read legal links off this, so a failure must still yield an object.
    footerInfo: data ?? (error ? FALLBACK : null),
    loading: isPending,
    error: (error as Error | null) ?? null,
  };
}
