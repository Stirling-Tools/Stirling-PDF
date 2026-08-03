export * from "@core/query/staleTime";

/**
 * Desktop override: config lookups expire, because a key does not pin a backend
 * here (see DesktopQueryCacheReset). The reset handles transitions we can
 * observe; this is the ceiling for anything we can't.
 *
 * Five minutes matches endpointAvailabilityService and saasAppConfigService.
 */
export const CONFIG_STALE_TIME = 5 * 60_000;
