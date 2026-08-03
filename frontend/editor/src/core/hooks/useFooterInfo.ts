import { useQuery } from "@tanstack/react-query";
import apiClient from "@app/services/apiClient";
import { qk } from "@app/query/keys";
import { CONFIG_STALE_TIME } from "@app/query/staleTime";

export interface FooterInfo {
  analyticsEnabled?: boolean;
  termsAndConditions?: string;
  privacyPolicy?: string;
  accessibilityStatement?: string;
  cookiePolicy?: string;
  impressum?: string;
}

/** Analytics off is the safe read when the server can't be asked. */
const FALLBACK: FooterInfo = { analyticsEnabled: false };

async function fetchFooterInfo(): Promise<FooterInfo> {
  const response = await apiClient.get<FooterInfo>(
    "/api/v1/ui-data/footer-info",
    {
      suppressErrorToast: true,
    } as never,
  );
  return response.data;
}

/**
 * Public footer configuration. Always accessible without authentication.
 *
 * Shared between the footer and the admin legal section, so the two mount
 * sites now resolve to one request instead of two.
 */
export function useFooterInfo() {
  const { data, isPending, error } = useQuery({
    queryKey: qk.footerInfo(),
    queryFn: fetchFooterInfo,
    staleTime: CONFIG_STALE_TIME,
  });

  return {
    // Callers read legal links off this, so a failure must still yield an
    // object — preserves the previous fall-back-to-analytics-off behaviour.
    footerInfo: data ?? (error ? FALLBACK : null),
    loading: isPending,
    error: (error as Error | null) ?? null,
  };
}
