package stirling.software.SPDF.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.extern.slf4j.Slf4j;

/**
 * Service for tracking Weekly Active Users (WAU) in no-login mode. Uses in-memory storage with
 * automatic cleanup of old entries.
 */
@ApplicationScoped
@Slf4j
public class WeeklyActiveUsersService {

    // Map of browser ID -> last seen timestamp
    private final Map<String, Instant> activeBrowsers = new ConcurrentHashMap<>();

    // Track total unique browsers seen (overall)
    private final AtomicLong totalUniqueBrowsers = new AtomicLong(0);

    // Application start time
    private final Instant startTime = Instant.now();

    /**
     * Records a browser access with the current timestamp
     *
     * @param browserId Unique browser identifier from X-Browser-Id header
     */
    public void recordBrowserAccess(String browserId) {
        if (browserId == null || browserId.trim().isEmpty()) {
            return;
        }

        Instant now = Instant.now();
        Instant previous = activeBrowsers.put(browserId, now);

        if (previous == null) {
            long total = totalUniqueBrowsers.incrementAndGet();
            log.debug("New browser recorded: {} (Total: {})", browserId, total);
        }
    }

    /**
     * Gets the count of unique browsers seen in the last 7 days
     *
     * @return Weekly Active Users count
     */
    public long getWeeklyActiveUsers() {
        cleanupOldEntries();
        return activeBrowsers.size();
    }

    /**
     * Gets the total count of unique browsers ever seen
     *
     * @return Total unique browsers count
     */
    public long getTotalUniqueBrowsers() {
        return totalUniqueBrowsers.get();
    }

    /**
     * Gets the number of days the service has been running
     *
     * @return Days online
     */
    public long getDaysOnline() {
        return ChronoUnit.DAYS.between(startTime, Instant.now());
    }

    /**
     * Gets the timestamp when tracking started
     *
     * @return Start time
     */
    public Instant getStartTime() {
        return startTime;
    }

    /** Removes entries older than 7 days */
    private void cleanupOldEntries() {
        Instant sevenDaysAgo = Instant.now().minus(7, ChronoUnit.DAYS);
        activeBrowsers.entrySet().removeIf(entry -> entry.getValue().isBefore(sevenDaysAgo));
    }

    /** Scheduled cleanup trigger running every hour */
    @Scheduled(fixedRate = 3600000)
    public void performCleanup() {
        int sizeBefore = activeBrowsers.size();
        cleanupOldEntries();
        int sizeAfter = activeBrowsers.size();

        if (sizeBefore != sizeAfter) {
            log.debug("Cleaned up {} old browser entries", sizeBefore - sizeAfter);
        }
    }
}
