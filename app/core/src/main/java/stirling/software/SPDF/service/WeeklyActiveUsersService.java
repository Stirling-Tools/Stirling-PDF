package stirling.software.SPDF.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

/**
 * Service for tracking Weekly Active Users (WAU) in no-login mode.
 * Uses in-memory storage with automatic cleanup of old entries.
 */
@Service
@Slf4j
public class WeeklyActiveUsersService {

    // Map of browser ID -> last seen timestamp
    private final Map<String, Instant> activeBrowsers = new ConcurrentHashMap<>();

    // Track total unique browsers seen (overall)
    private long totalUniqueBrowsers = 0;

    // Application start time
    private final Instant startTime = Instant.now();

    /**
     * Records a browser access with the current timestamp
     * @param browserId Unique browser identifier from X-Browser-Id header
     */
    public void recordBrowserAccess(String browserId) {
        if (browserId == null || browserId.trim().isEmpty()) {
            return;
        }

        boolean isNewBrowser = !activeBrowsers.containsKey(browserId);
        activeBrowsers.put(browserId, Instant.now());

        if (isNewBrowser) {
            totalUniqueBrowsers++;
            log.debug("New browser recorded: {} (Total: {})", browserId, totalUniqueBrowsers);
        }
    }

    /**
     * Gets the count of unique browsers seen in the last 7 days
     * @return Weekly Active Users count
     */
    public long getWeeklyActiveUsers() {
        cleanupOldEntries();
        return activeBrowsers.size();
    }

    /**
     * Gets the total count of unique browsers ever seen
     * @return Total unique browsers count
     */
    public long getTotalUniqueBrowsers() {
        return totalUniqueBrowsers;
    }

    /**
     * Gets the number of days the service has been running
     * @return Days online
     */
    public long getDaysOnline() {
        return ChronoUnit.DAYS.between(startTime, Instant.now());
    }

    /**
     * Gets the timestamp when tracking started
     * @return Start time
     */
    public Instant getStartTime() {
        return startTime;
    }

    /**
     * Removes entries older than 7 days
     */
    private void cleanupOldEntries() {
        Instant sevenDaysAgo = Instant.now().minus(7, ChronoUnit.DAYS);
        activeBrowsers.entrySet().removeIf(entry -> entry.getValue().isBefore(sevenDaysAgo));
    }

    /**
     * Manual cleanup trigger (can be called by scheduled task if needed)
     */
    public void performCleanup() {
        int sizeBefore = activeBrowsers.size();
        cleanupOldEntries();
        int sizeAfter = activeBrowsers.size();

        if (sizeBefore != sizeAfter) {
            log.debug("Cleaned up {} old browser entries", sizeBefore - sizeAfter);
        }
    }
}
