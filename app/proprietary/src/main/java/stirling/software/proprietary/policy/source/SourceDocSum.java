package stirling.software.proprietary.policy.source;

/**
 * A {@code (sourceId, summed document count)} row, populated by the doc-count aggregate queries.
 */
public record SourceDocSum(String sourceId, Long count) {}
