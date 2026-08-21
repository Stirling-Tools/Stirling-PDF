package stirling.software.proprietary.policy.source;

/**
 * A {@code (sourceId, epoch-day, summed document count)} row from the daily-aggregate query. The
 * day is {@code floor(bucketHour / 24)}, i.e. hours-since-epoch collapsed to days-since-epoch.
 */
public record SourceDayDocSum(String sourceId, Long day, Long docs) {}
