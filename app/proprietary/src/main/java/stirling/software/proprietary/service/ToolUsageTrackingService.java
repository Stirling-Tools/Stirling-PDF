package stirling.software.proprietary.service;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.ToolUsageStat;
import stirling.software.proprietary.repository.ToolUsageStatRepository;

/**
 * Records completed tool runs into daily rollup rows. One completion is one increment of one row,
 * which is negligible next to the PDF work that produced it.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ToolUsageTrackingService {

    private static final Pattern TOOL_KEY_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");

    private final ToolUsageStatRepository usageRepository;
    private final ApplicationProperties applicationProperties;

    public static boolean isValidToolKey(String toolKey) {
        return toolKey != null && TOOL_KEY_PATTERN.matcher(toolKey).matches();
    }

    /** Per-principal usage is profiling, so admin analytics consent gates it too. */
    static boolean isUsageDataAllowed(ApplicationProperties properties) {
        return properties.getToolRecommendations().isEnabled()
                && properties.getSystem().isAnalyticsEnabled();
    }

    /**
     * Counts one completed run of {@code toolKey}, attributing it to the tool the user came from
     * when that is a different, valid tool. Never throws: recommendations must not break tools.
     */
    public void recordUsage(String principal, String toolKey, String previousToolKey) {
        if (!isUsageDataAllowed(applicationProperties)
                || principal == null
                || !isValidToolKey(toolKey)) {
            return;
        }
        String fromTool =
                isValidToolKey(previousToolKey) && !previousToolKey.equals(toolKey)
                        ? previousToolKey
                        : ToolUsageStat.NO_PREVIOUS_TOOL;
        long epochDay = currentEpochDay();
        try {
            if (usageRepository.incrementCount(principal, fromTool, toolKey, epochDay, 1) == 0) {
                insertFirstRunOfDay(principal, fromTool, toolKey, epochDay);
            }
        } catch (Exception e) {
            log.warn("Failed to record usage of {} for {}: {}", toolKey, principal, e.getMessage());
        }
    }

    private void insertFirstRunOfDay(
            String principal, String fromTool, String toolKey, long epochDay) {
        try {
            usageRepository.insertCount(principal, fromTool, toolKey, epochDay, 1);
        } catch (DataIntegrityViolationException e) {
            // Another request inserted the row first; add to theirs instead of clobbering it.
            usageRepository.incrementCount(principal, fromTool, toolKey, epochDay, 1);
        }
    }

    /** Daily retention sweep; the table holds one row per principal, transition and day. */
    @Scheduled(fixedDelay = 1, initialDelay = 1, timeUnit = TimeUnit.DAYS)
    public void cleanupOldStats() {
        int retentionDays = applicationProperties.getToolRecommendations().getRetentionDays();
        if (retentionDays <= 0) {
            return;
        }
        try {
            int deleted = usageRepository.deleteOlderThan(currentEpochDay() - retentionDays);
            if (deleted > 0) {
                log.info("Tool usage retention sweep removed {} rows", deleted);
            }
        } catch (Exception e) {
            log.error("Tool usage retention sweep failed", e);
        }
    }

    static long currentEpochDay() {
        return LocalDate.now(ZoneOffset.UTC).toEpochDay();
    }
}
