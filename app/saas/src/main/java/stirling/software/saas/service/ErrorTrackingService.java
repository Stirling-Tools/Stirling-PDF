package stirling.software.saas.service;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import io.quarkus.arc.profile.IfBuildProfile;
import io.quarkus.scheduler.Scheduled;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.config.CreditsProperties;
import stirling.software.saas.model.ProcessingErrorType;
import stirling.software.saas.model.UserErrorTracker;
import stirling.software.saas.repository.UserErrorTrackerRepository;

@ApplicationScoped
@IfBuildProfile("saas")
@Slf4j
@Transactional
public class ErrorTrackingService {

    private final UserErrorTrackerRepository errorTrackerRepository;
    private final UserRepository userRepository;
    private final CreditsProperties creditsProperties;

    /**
     * Local cache for error counts to reduce database chatter.
     *
     * <p>This cache is used to temporarily store error counts for each API key and endpoint,
     * reducing the frequency of database writes and lookups.
     *
     * <p><b>Nullability:</b> This field may be {@code null} if local caching is disabled via {@link
     * CreditsProperties#getCache()#isLocalEnabled()}. All usages must check for null before
     * accessing or invoking methods on this cache.
     *
     * <p><b>Lifecycle:</b> The cache is initialized in the constructor based on configuration and
     * remains unchanged for the lifetime of this service instance.
     *
     * <p><b>Thread-safety:</b> The underlying Caffeine cache is thread-safe.
     */
    private final Cache<String, ErrorCountCache> errorCountCache;

    public ErrorTrackingService(
            UserErrorTrackerRepository errorTrackerRepository,
            UserRepository userRepository,
            CreditsProperties creditsProperties) {
        this.errorTrackerRepository = errorTrackerRepository;
        this.userRepository = userRepository;
        this.creditsProperties = creditsProperties;

        // Initialize cache based on configuration
        this.errorCountCache =
                creditsProperties.getCache().isLocalEnabled()
                        ? Caffeine.newBuilder()
                                .maximumSize(10000)
                                .expireAfterWrite(
                                        creditsProperties.getErrors().getTtlMinutes(),
                                        TimeUnit.MINUTES)
                                .build()
                        : null;
    }

    /**
     * Record an error and determine if credits should be consumed
     *
     * @param apiKey User's API key
     * @param endpoint The endpoint that failed
     * @param throwable The exception that occurred
     * @param httpStatus HTTP response status
     * @return true if credits should be consumed for this error
     */
    public boolean recordErrorAndShouldConsumeCredit(
            String apiKey, String endpoint, Throwable throwable, int httpStatus) {
        ProcessingErrorType errorType =
                ProcessingErrorType.classifyError(throwable, httpStatus, endpoint);

        // Never charge for validation errors or system errors
        if (errorType != ProcessingErrorType.PROCESSING_ERROR) {
            log.debug(
                    "Error classified as {}, no credit consumption for API key: {}, endpoint: {}",
                    errorType,
                    maskApiKey(apiKey),
                    endpoint);
            return false;
        }

        String cacheKey = apiKey + "|" + endpoint;

        if (errorCountCache != null) {
            // Use cache for fast tracking
            ErrorCountCache cachedCount = errorCountCache.get(cacheKey, k -> new ErrorCountCache());
            cachedCount.incrementErrorCount();

            boolean shouldCharge =
                    cachedCount.getErrorCount()
                            > creditsProperties.getErrors().getFreeProcessingErrors();

            // Persist to DB when crossing the charging threshold or on first error
            if (shouldCharge
                    && cachedCount.getErrorCount()
                            == creditsProperties.getErrors().getFreeProcessingErrors() + 1) {
                persistErrorToDatabase(apiKey, endpoint);
            }

            log.info(
                    "Processing error recorded (cached) for API key: {}, endpoint: {}, error count: {}, will charge: {}",
                    maskApiKey(apiKey),
                    endpoint,
                    cachedCount.getErrorCount(),
                    shouldCharge);

            return shouldCharge;
        } else {
            // Fallback to direct DB tracking
            return recordErrorDirectToDatabase(apiKey, endpoint);
        }
    }

    private boolean recordErrorDirectToDatabase(String apiKey, String endpoint) {
        Optional<User> userOpt = userRepository.findByApiKey(apiKey);
        if (userOpt.isEmpty()) {
            log.warn("User not found for API key: {}", maskApiKey(apiKey));
            return false;
        }

        User user = userOpt.get();
        UserErrorTracker tracker = getOrCreateErrorTracker(user, endpoint);

        tracker.recordProcessingError(creditsProperties.getErrors().getTtlMinutes());
        errorTrackerRepository.persist(tracker);

        boolean shouldCharge =
                tracker.shouldChargeForProcessingError(
                        creditsProperties.getErrors().getFreeProcessingErrors());

        log.info(
                "Processing error recorded (DB) for user: {}, endpoint: {}, error count: {}, will charge: {}",
                user.getUsername(),
                endpoint,
                tracker.getProcessingErrorCount(),
                shouldCharge);

        return shouldCharge;
    }

    private void persistErrorToDatabase(String apiKey, String endpoint) {
        try {
            Optional<User> userOpt = userRepository.findByApiKey(apiKey);
            if (userOpt.isPresent()) {
                User user = userOpt.get();
                UserErrorTracker tracker = getOrCreateErrorTracker(user, endpoint);
                // Set to threshold + 1 to indicate charging has started
                tracker.setProcessingErrorCount(
                        creditsProperties.getErrors().getFreeProcessingErrors() + 1);
                tracker.setLastProcessingError(LocalDateTime.now());
                tracker.setResetAfter(
                        LocalDateTime.now()
                                .plusMinutes(creditsProperties.getErrors().getTtlMinutes()));
                errorTrackerRepository.persist(tracker);
                log.debug(
                        "Persisted error threshold crossing to DB for API key: {}, endpoint: {}",
                        maskApiKey(apiKey),
                        endpoint);
            }
        } catch (Exception e) {
            log.error(
                    "Failed to persist error to database for API key: {}, endpoint: {}",
                    maskApiKey(apiKey),
                    endpoint,
                    e);
        }
    }

    /** Check if a user has high error counts that might indicate abuse */
    public boolean hasHighErrorCount(String apiKey, String endpoint) {
        Optional<UserErrorTracker> trackerOpt =
                errorTrackerRepository.findByUserApiKeyAndEndpoint(apiKey, endpoint);
        return trackerOpt
                .map(
                        t ->
                                t.shouldChargeForProcessingError(
                                        creditsProperties.getErrors().getFreeProcessingErrors()))
                .orElse(false);
    }

    /** Get error information for a user and endpoint */
    public ErrorInfo getErrorInfo(String apiKey, String endpoint) {
        String cacheKey = apiKey + "|" + endpoint;

        if (errorCountCache != null) {
            // Check cache first
            ErrorCountCache cachedCount = errorCountCache.getIfPresent(cacheKey);
            if (cachedCount != null) {
                int currentCount = cachedCount.getErrorCount();
                int freeErrors = creditsProperties.getErrors().getFreeProcessingErrors();
                return new ErrorInfo(
                        currentCount,
                        Math.max(0, freeErrors - currentCount),
                        currentCount > freeErrors,
                        cachedCount.getLastErrorTime());
            }
        }

        // Fallback to DB
        Optional<UserErrorTracker> trackerOpt =
                errorTrackerRepository.findByUserApiKeyAndEndpoint(apiKey, endpoint);
        if (trackerOpt.isEmpty()) {
            return new ErrorInfo(
                    0, creditsProperties.getErrors().getFreeProcessingErrors(), false, null);
        }

        UserErrorTracker tracker = trackerOpt.get();

        // Reset if expired
        if (tracker.isExpired()) {
            tracker.resetErrorCount(creditsProperties.getErrors().getTtlMinutes());
            errorTrackerRepository.persist(tracker);
            return new ErrorInfo(
                    0, creditsProperties.getErrors().getFreeProcessingErrors(), false, null);
        }

        return new ErrorInfo(
                tracker.getProcessingErrorCount(),
                tracker.getErrorsUntilCharged(
                        creditsProperties.getErrors().getFreeProcessingErrors()),
                tracker.shouldChargeForProcessingError(
                        creditsProperties.getErrors().getFreeProcessingErrors()),
                tracker.getLastProcessingError());
    }

    private UserErrorTracker getOrCreateErrorTracker(User user, String endpoint) {
        Optional<UserErrorTracker> existing =
                errorTrackerRepository.findByUserAndEndpoint(user, endpoint);

        if (existing.isPresent()) {
            UserErrorTracker tracker = existing.get();

            // Reset if expired
            if (tracker.isExpired()) {
                tracker.resetErrorCount(creditsProperties.getErrors().getTtlMinutes());
            }

            return tracker;
        }

        // Create new tracker
        return new UserErrorTracker(user, endpoint, creditsProperties.getErrors().getTtlMinutes());
    }

    /** Clean up expired error trackers every hour */
    @Scheduled(cron = "0 0 * * * ?")
    public void cleanupExpiredErrorTrackers() {
        try {
            int deleted = errorTrackerRepository.deleteExpiredErrorTrackers(LocalDateTime.now());
            if (deleted > 0) {
                log.debug("Cleaned up {} expired error trackers", deleted);
            }
        } catch (Exception e) {
            log.error("Error cleaning up expired error trackers", e);
        }
    }

    private String maskApiKey(String apiKey) {
        if (apiKey == null || apiKey.length() < 8) {
            return "***";
        }
        return apiKey.substring(0, 4) + "***" + apiKey.substring(apiKey.length() - 4);
    }

    /** Information about user's error status for an endpoint */
    public static class ErrorInfo {
        public final int currentErrorCount;
        public final int errorsUntilCharged;
        public final boolean isChargingForErrors;
        public final LocalDateTime lastError;

        public ErrorInfo(
                int currentErrorCount,
                int errorsUntilCharged,
                boolean isChargingForErrors,
                LocalDateTime lastError) {
            this.currentErrorCount = currentErrorCount;
            this.errorsUntilCharged = errorsUntilCharged;
            this.isChargingForErrors = isChargingForErrors;
            this.lastError = lastError;
        }
    }

    /** Cache entry for tracking error counts in memory */
    private static class ErrorCountCache {
        private int errorCount = 0;
        private LocalDateTime lastErrorTime = LocalDateTime.now();

        public void incrementErrorCount() {
            errorCount++;
            lastErrorTime = LocalDateTime.now();
        }

        public int getErrorCount() {
            return errorCount;
        }

        public LocalDateTime getLastErrorTime() {
            return lastErrorTime;
        }
    }
}
