package stirling.software.proprietary.sources.model;

/**
 * One tile in the Sources KPI strip. The tile's label is product copy held client-side; only the
 * value and its sub-description flow from the backend. Deltas are intentionally omitted until we
 * track a prior-period baseline to compare against (no fabricated trends).
 */
public record SourcesKpi(long value, String description) {}
