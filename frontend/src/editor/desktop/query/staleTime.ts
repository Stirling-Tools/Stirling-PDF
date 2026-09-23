export * from "@core/query/staleTime";

// Desktop keys don't pin a backend (see DesktopQueryCacheReset), so expire as a
// backstop. 5 min matches endpointAvailabilityService and saasAppConfigService.
export const CONFIG_STALE_TIME = 5 * 60_000;
