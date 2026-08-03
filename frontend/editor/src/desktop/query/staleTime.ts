export * from "@core/query/staleTime";

/**
 * Desktop override: config lookups expire, because a key does not pin a backend
 * here (see DesktopQueryCacheReset). The reset handles the transitions we can
 * observe; this is the ceiling for anything we can't.
 *
 * Five minutes matches the TTLs endpointAvailabilityService and
 * saasAppConfigService already use for the same class of data.
 */
export const CONFIG_STALE_TIME = 5 * 60_000;
