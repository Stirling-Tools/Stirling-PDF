package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.config.CreditsProperties;
import stirling.software.saas.model.UserErrorTracker;
import stirling.software.saas.repository.UserErrorTrackerRepository;
import stirling.software.saas.service.ErrorTrackingService.ErrorInfo;

/**
 * Unit tests for {@link ErrorTrackingService}.
 *
 * <p>The service has two distinct tracking paths chosen at construction time based on {@link
 * CreditsProperties.Cache#isLocalEnabled()}: an in-memory Caffeine cache path and a direct-to-DB
 * fallback. Because the cache field is final and decided in the constructor, each path is exercised
 * by building the service with a tailored {@link CreditsProperties}. Defaults are {@code
 * freeProcessingErrors = 2} and {@code ttlMinutes = 60}.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ErrorTrackingServiceTest {

    @Mock private UserErrorTrackerRepository errorTrackerRepository;
    @Mock private UserRepository userRepository;

    private static final String API_KEY =
            "test-api-key-0001"; // gitleaks:allow - test fixture, not a secret
    private static final String ENDPOINT = "/api/v1/convert/pdf-to-img";

    /** Build a CreditsProperties with the given cache + error config. */
    private static CreditsProperties props(
            boolean localCacheEnabled, int freeProcessingErrors, int ttlMinutes) {
        CreditsProperties p = new CreditsProperties();
        p.getCache().setLocalEnabled(localCacheEnabled);
        p.getErrors().setFreeProcessingErrors(freeProcessingErrors);
        p.getErrors().setTtlMinutes(ttlMinutes);
        return p;
    }

    private ErrorTrackingService cachedService(int freeProcessingErrors) {
        return new ErrorTrackingService(
                errorTrackerRepository, userRepository, props(true, freeProcessingErrors, 60));
    }

    private ErrorTrackingService dbService(int freeProcessingErrors) {
        return new ErrorTrackingService(
                errorTrackerRepository, userRepository, props(false, freeProcessingErrors, 60));
    }

    private static User user(String username, String apiKey) {
        User u = new User();
        u.setUsername(username);
        u.setApiKey(apiKey);
        return u;
    }

    /**
     * A throwable that classifies as PROCESSING_ERROR when paired with httpStatus 200 and a
     * non-null endpoint: not a validation/system error, so the endpoint-based processing branch
     * wins.
     */
    private static Throwable processingThrowable() {
        return new RuntimeException("corrupt pdf stream while rendering page");
    }

    @Nested
    @DisplayName("recordErrorAndShouldConsumeCredit - error classification gate")
    class ClassificationGate {

        @Test
        @DisplayName("validation error (400) never charges and never touches DB or cache")
        void validationError_doesNotCharge() {
            ErrorTrackingService service = cachedService(2);

            boolean charge =
                    service.recordErrorAndShouldConsumeCredit(
                            API_KEY,
                            ENDPOINT,
                            new IllegalArgumentException("missing parameter"),
                            400);

            assertThat(charge).isFalse();
            verify(errorTrackerRepository, never()).save(any());
            verifyNoInteractions(userRepository);
        }

        @Test
        @DisplayName("auth error (401) classifies as validation and never charges")
        void authError_doesNotCharge() {
            ErrorTrackingService service = cachedService(2);

            boolean charge =
                    service.recordErrorAndShouldConsumeCredit(
                            API_KEY, ENDPOINT, new RuntimeException("denied"), 401);

            assertThat(charge).isFalse();
            verify(errorTrackerRepository, never()).save(any());
        }

        @Test
        @DisplayName("system error (500) never charges")
        void systemError_doesNotCharge() {
            ErrorTrackingService service = cachedService(2);

            boolean charge =
                    service.recordErrorAndShouldConsumeCredit(
                            API_KEY, ENDPOINT, new RuntimeException("server boom"), 500);

            assertThat(charge).isFalse();
            verify(errorTrackerRepository, never()).save(any());
        }

        @Test
        @DisplayName("system exception type (SQLException) at 200 never charges")
        void systemExceptionType_doesNotCharge() {
            ErrorTrackingService service = cachedService(2);

            boolean charge =
                    service.recordErrorAndShouldConsumeCredit(
                            API_KEY, ENDPOINT, new SQLException("db down"), 200);

            assertThat(charge).isFalse();
            verify(errorTrackerRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("recordErrorAndShouldConsumeCredit - cache path (freeProcessingErrors=2)")
    class CachePath {

        @Test
        @DisplayName("first two processing errors are free; the 3rd charges")
        void firstTwoFree_thirdCharges() {
            ErrorTrackingService service = cachedService(2);
            User u = user("alice", API_KEY);
            when(userRepository.findByApiKey(API_KEY)).thenReturn(Optional.of(u));
            when(errorTrackerRepository.findByUserAndEndpoint(u, ENDPOINT))
                    .thenReturn(Optional.empty());

            // count=1 -> not > 2
            assertThat(call(service)).isFalse();
            // count=2 -> not > 2
            assertThat(call(service)).isFalse();
            // count=3 -> > 2 -> charge, and threshold-crossing persists to DB
            assertThat(call(service)).isTrue();
            // count=4 -> still charges, but no second persist (only on the exact crossing)
            assertThat(call(service)).isTrue();

            // Persisted exactly once: on the threshold-crossing call (count == free + 1).
            verify(errorTrackerRepository, times(1)).save(any(UserErrorTracker.class));
        }

        @Test
        @DisplayName("threshold-crossing persists a tracker set to free+1 with future resetAfter")
        void thresholdCrossing_persistsTrackerWithCorrectCount() {
            ErrorTrackingService service = cachedService(2);
            User u = user("bob", API_KEY);
            when(userRepository.findByApiKey(API_KEY)).thenReturn(Optional.of(u));
            when(errorTrackerRepository.findByUserAndEndpoint(u, ENDPOINT))
                    .thenReturn(Optional.empty());

            LocalDateTime before = LocalDateTime.now();
            call(service); // 1
            call(service); // 2
            call(service); // 3 -> persist

            ArgumentCaptor<UserErrorTracker> captor =
                    ArgumentCaptor.forClass(UserErrorTracker.class);
            verify(errorTrackerRepository).save(captor.capture());
            UserErrorTracker saved = captor.getValue();
            assertThat(saved.getProcessingErrorCount()).isEqualTo(3); // free(2) + 1
            assertThat(saved.getUser()).isSameAs(u);
            assertThat(saved.getEndpoint()).isEqualTo(ENDPOINT);
            assertThat(saved.getLastProcessingError()).isNotNull();
            assertThat(saved.getResetAfter()).isAfter(before);
        }

        @Test
        @DisplayName("zero free errors: first processing error charges immediately")
        void zeroFree_firstErrorCharges() {
            ErrorTrackingService service = cachedService(0);
            User u = user("carol", API_KEY);
            when(userRepository.findByApiKey(API_KEY)).thenReturn(Optional.of(u));
            when(errorTrackerRepository.findByUserAndEndpoint(u, ENDPOINT))
                    .thenReturn(Optional.empty());

            // count=1 > free(0) -> charge, and 1 == free+1 -> persist
            assertThat(call(service)).isTrue();
            verify(errorTrackerRepository, times(1)).save(any(UserErrorTracker.class));
        }

        @Test
        @DisplayName("distinct endpoints are tracked independently in the cache")
        void distinctEndpoints_trackedSeparately() {
            ErrorTrackingService service = cachedService(2);

            // Two errors on endpoint A, two on endpoint B -> neither crosses the free=2 threshold.
            assertThat(
                            service.recordErrorAndShouldConsumeCredit(
                                    API_KEY, "/a", processingThrowable(), 200))
                    .isFalse();
            assertThat(
                            service.recordErrorAndShouldConsumeCredit(
                                    API_KEY, "/a", processingThrowable(), 200))
                    .isFalse();
            assertThat(
                            service.recordErrorAndShouldConsumeCredit(
                                    API_KEY, "/b", processingThrowable(), 200))
                    .isFalse();
            assertThat(
                            service.recordErrorAndShouldConsumeCredit(
                                    API_KEY, "/b", processingThrowable(), 200))
                    .isFalse();

            // Neither key crossed free+1, so no DB persistence at all.
            verify(errorTrackerRepository, never()).save(any());
        }

        @Test
        @DisplayName("cache path does not blow up if the user is absent at persist time")
        void cachePersist_userAbsent_swallowsAndStillCharges() {
            ErrorTrackingService service = cachedService(2);
            // No user for this key: persistErrorToDatabase finds nothing and saves nothing.
            when(userRepository.findByApiKey(API_KEY)).thenReturn(Optional.empty());

            assertThat(call(service)).isFalse(); // 1
            assertThat(call(service)).isFalse(); // 2
            assertThat(call(service)).isTrue(); // 3 -> tries persist, user missing -> no save

            verify(errorTrackerRepository, never()).save(any());
        }

        /** Convenience: record one processing error on the standard key. */
        private boolean call(ErrorTrackingService service) {
            return service.recordErrorAndShouldConsumeCredit(
                    API_KEY, ENDPOINT, processingThrowable(), 200);
        }
    }

    @Nested
    @DisplayName("recordErrorAndShouldConsumeCredit - DB fallback path (cache disabled)")
    class DbFallbackPath {

        @Test
        @DisplayName("unknown API key returns false and saves nothing")
        void unknownApiKey_returnsFalse() {
            ErrorTrackingService service = dbService(2);
            when(userRepository.findByApiKey(API_KEY)).thenReturn(Optional.empty());

            boolean charge =
                    service.recordErrorAndShouldConsumeCredit(
                            API_KEY, ENDPOINT, processingThrowable(), 200);

            assertThat(charge).isFalse();
            verify(errorTrackerRepository, never()).save(any());
        }

        @Test
        @DisplayName(
                "creates a new tracker, records the error and persists; below threshold no charge")
        void newTracker_belowThreshold_noCharge() {
            ErrorTrackingService service = dbService(2);
            User u = user("dave", API_KEY);
            when(userRepository.findByApiKey(API_KEY)).thenReturn(Optional.of(u));
            when(errorTrackerRepository.findByUserAndEndpoint(u, ENDPOINT))
                    .thenReturn(Optional.empty());

            boolean charge =
                    service.recordErrorAndShouldConsumeCredit(
                            API_KEY, ENDPOINT, processingThrowable(), 200);

            assertThat(charge).isFalse(); // count 1, free 2

            ArgumentCaptor<UserErrorTracker> captor =
                    ArgumentCaptor.forClass(UserErrorTracker.class);
            verify(errorTrackerRepository).save(captor.capture());
            assertThat(captor.getValue().getProcessingErrorCount()).isEqualTo(1);
            assertThat(captor.getValue().getUser()).isSameAs(u);
        }

        @Test
        @DisplayName("existing tracker already at the threshold rolls over to charging")
        void existingTracker_atThreshold_charges() {
            ErrorTrackingService service = dbService(2);
            User u = user("erin", API_KEY);
            when(userRepository.findByApiKey(API_KEY)).thenReturn(Optional.of(u));

            UserErrorTracker tracker = new UserErrorTracker(u, ENDPOINT, 60);
            tracker.setProcessingErrorCount(2); // at the free limit
            when(errorTrackerRepository.findByUserAndEndpoint(u, ENDPOINT))
                    .thenReturn(Optional.of(tracker));

            boolean charge =
                    service.recordErrorAndShouldConsumeCredit(
                            API_KEY, ENDPOINT, processingThrowable(), 200);

            // recordProcessingError bumps 2 -> 3, which is > free(2) -> charge
            assertThat(charge).isTrue();
            assertThat(tracker.getProcessingErrorCount()).isEqualTo(3);
            verify(errorTrackerRepository).save(tracker);
        }

        @Test
        @DisplayName("expired existing tracker is reset before recording the new error")
        void expiredTracker_isResetThenRecorded() {
            ErrorTrackingService service = dbService(2);
            User u = user("finn", API_KEY);
            when(userRepository.findByApiKey(API_KEY)).thenReturn(Optional.of(u));

            UserErrorTracker tracker = new UserErrorTracker(u, ENDPOINT, 60);
            tracker.setProcessingErrorCount(5);
            tracker.setResetAfter(LocalDateTime.now().minusMinutes(1)); // expired
            when(errorTrackerRepository.findByUserAndEndpoint(u, ENDPOINT))
                    .thenReturn(Optional.of(tracker));

            boolean charge =
                    service.recordErrorAndShouldConsumeCredit(
                            API_KEY, ENDPOINT, processingThrowable(), 200);

            // reset to 0, then recordProcessingError -> 1, which is not > free(2)
            assertThat(charge).isFalse();
            assertThat(tracker.getProcessingErrorCount()).isEqualTo(1);
            verify(errorTrackerRepository).save(tracker);
        }
    }

    @Nested
    @DisplayName("hasHighErrorCount")
    class HasHighErrorCount {

        @Test
        @DisplayName("returns false when no tracker exists for the key")
        void noTracker_false() {
            ErrorTrackingService service = cachedService(2);
            when(errorTrackerRepository.findByUserApiKeyAndEndpoint(API_KEY, ENDPOINT))
                    .thenReturn(Optional.empty());

            assertThat(service.hasHighErrorCount(API_KEY, ENDPOINT)).isFalse();
        }

        @Test
        @DisplayName("true when the tracker's count exceeds the free allowance")
        void aboveFree_true() {
            ErrorTrackingService service = cachedService(2);
            UserErrorTracker tracker = new UserErrorTracker(user("g", API_KEY), ENDPOINT, 60);
            tracker.setProcessingErrorCount(3); // > 2
            when(errorTrackerRepository.findByUserApiKeyAndEndpoint(API_KEY, ENDPOINT))
                    .thenReturn(Optional.of(tracker));

            assertThat(service.hasHighErrorCount(API_KEY, ENDPOINT)).isTrue();
        }

        @Test
        @DisplayName("false when the count is exactly at the free allowance (boundary)")
        void atFree_false() {
            ErrorTrackingService service = cachedService(2);
            UserErrorTracker tracker = new UserErrorTracker(user("g", API_KEY), ENDPOINT, 60);
            tracker.setProcessingErrorCount(2); // not > 2
            when(errorTrackerRepository.findByUserApiKeyAndEndpoint(API_KEY, ENDPOINT))
                    .thenReturn(Optional.of(tracker));

            assertThat(service.hasHighErrorCount(API_KEY, ENDPOINT)).isFalse();
        }
    }

    @Nested
    @DisplayName("getErrorInfo")
    class GetErrorInfo {

        @Test
        @DisplayName("cache hit reflects the live cached count, remaining free and charging flag")
        void cacheHit_reportsLiveCount() {
            ErrorTrackingService service = cachedService(2);

            // Drive the cache to 3 errors on the key so a subsequent getErrorInfo reads it.
            for (int i = 0; i < 3; i++) {
                service.recordErrorAndShouldConsumeCredit(
                        API_KEY, ENDPOINT, processingThrowable(), 200);
            }

            ErrorInfo info = service.getErrorInfo(API_KEY, ENDPOINT);

            assertThat(info.currentErrorCount).isEqualTo(3);
            // Math.max(0, free(2) - 3) == 0
            assertThat(info.errorsUntilCharged).isZero();
            assertThat(info.isChargingForErrors).isTrue(); // 3 > 2
            assertThat(info.lastError).isNotNull();
        }

        @Test
        @DisplayName("cache miss falls back to an empty/zeroed ErrorInfo when no DB row exists")
        void cacheMiss_noDbRow_zeroedInfo() {
            ErrorTrackingService service = cachedService(2);
            when(errorTrackerRepository.findByUserApiKeyAndEndpoint(API_KEY, ENDPOINT))
                    .thenReturn(Optional.empty());

            ErrorInfo info = service.getErrorInfo(API_KEY, ENDPOINT);

            assertThat(info.currentErrorCount).isZero();
            assertThat(info.errorsUntilCharged).isEqualTo(2); // full free allowance
            assertThat(info.isChargingForErrors).isFalse();
            assertThat(info.lastError).isNull();
        }

        @Test
        @DisplayName("DB-backed (cache disabled): live tracker is reported with derived fields")
        void dbBacked_liveTracker_reported() {
            ErrorTrackingService service = dbService(2);
            UserErrorTracker tracker = new UserErrorTracker(user("h", API_KEY), ENDPOINT, 60);
            tracker.setProcessingErrorCount(3);
            tracker.setLastProcessingError(LocalDateTime.now());
            // not expired (constructor set resetAfter ~60m out)
            when(errorTrackerRepository.findByUserApiKeyAndEndpoint(API_KEY, ENDPOINT))
                    .thenReturn(Optional.of(tracker));

            ErrorInfo info = service.getErrorInfo(API_KEY, ENDPOINT);

            assertThat(info.currentErrorCount).isEqualTo(3);
            // getErrorsUntilCharged = max(0, free+1 - current) = max(0, 3 - 3) = 0
            assertThat(info.errorsUntilCharged).isZero();
            assertThat(info.isChargingForErrors).isTrue(); // 3 > 2
            assertThat(info.lastError).isNotNull();
            verify(errorTrackerRepository, never()).save(any());
        }

        @Test
        @DisplayName("DB-backed: expired tracker is reset, persisted and reported as zeroed")
        void dbBacked_expiredTracker_resetAndZeroed() {
            ErrorTrackingService service = dbService(2);
            UserErrorTracker tracker = new UserErrorTracker(user("i", API_KEY), ENDPOINT, 60);
            tracker.setProcessingErrorCount(7);
            tracker.setResetAfter(LocalDateTime.now().minusMinutes(1)); // expired
            when(errorTrackerRepository.findByUserApiKeyAndEndpoint(API_KEY, ENDPOINT))
                    .thenReturn(Optional.of(tracker));

            ErrorInfo info = service.getErrorInfo(API_KEY, ENDPOINT);

            assertThat(info.currentErrorCount).isZero();
            assertThat(info.errorsUntilCharged).isEqualTo(2);
            assertThat(info.isChargingForErrors).isFalse();
            assertThat(info.lastError).isNull();
            assertThat(tracker.getProcessingErrorCount()).isZero(); // reset mutated the entity
            verify(errorTrackerRepository).save(tracker);
        }
    }

    @Nested
    @DisplayName("cleanupExpiredErrorTrackers")
    class Cleanup {

        @Test
        @DisplayName("delegates to the repository delete with a 'now' cutoff")
        void delegatesDelete() {
            ErrorTrackingService service = cachedService(2);
            when(errorTrackerRepository.deleteExpiredErrorTrackers(any(LocalDateTime.class)))
                    .thenReturn(4);

            service.cleanupExpiredErrorTrackers();

            verify(errorTrackerRepository).deleteExpiredErrorTrackers(any(LocalDateTime.class));
        }

        @Test
        @DisplayName("swallows repository exceptions so the scheduler keeps running")
        void swallowsRepositoryException() {
            ErrorTrackingService service = cachedService(2);
            when(errorTrackerRepository.deleteExpiredErrorTrackers(any(LocalDateTime.class)))
                    .thenThrow(new RuntimeException("delete blew up"));

            // Must not propagate.
            service.cleanupExpiredErrorTrackers();

            verify(errorTrackerRepository).deleteExpiredErrorTrackers(any(LocalDateTime.class));
        }

        @Test
        @DisplayName("zero deletions still completes cleanly")
        void zeroDeletions_ok() {
            ErrorTrackingService service = cachedService(2);
            when(errorTrackerRepository.deleteExpiredErrorTrackers(any(LocalDateTime.class)))
                    .thenReturn(0);

            service.cleanupExpiredErrorTrackers();

            verify(errorTrackerRepository).deleteExpiredErrorTrackers(any(LocalDateTime.class));
        }
    }

    @Nested
    @DisplayName("ErrorInfo value holder")
    class ErrorInfoHolder {

        @Test
        @DisplayName("constructor wires the public fields verbatim")
        void fieldsWiredVerbatim() {
            LocalDateTime ts = LocalDateTime.now();
            ErrorInfo info = new ErrorInfo(5, 1, true, ts);

            assertThat(info.currentErrorCount).isEqualTo(5);
            assertThat(info.errorsUntilCharged).isEqualTo(1);
            assertThat(info.isChargingForErrors).isTrue();
            assertThat(info.lastError).isEqualTo(ts);
        }
    }

    @Nested
    @DisplayName("API key masking is exercised without leaking (smoke via logging branches)")
    class MaskingSmoke {

        @Test
        @DisplayName("short API keys are tolerated end-to-end on the cache path")
        void shortApiKey_tolerated() {
            ErrorTrackingService service = cachedService(2);
            when(userRepository.findByApiKey(anyString())).thenReturn(Optional.empty());

            // "key" is < 8 chars, masked as *** inside the service; must not throw on persist path.
            boolean c1 =
                    service.recordErrorAndShouldConsumeCredit(
                            "key", ENDPOINT, processingThrowable(), 200);
            boolean c2 =
                    service.recordErrorAndShouldConsumeCredit(
                            "key", ENDPOINT, processingThrowable(), 200);
            boolean c3 =
                    service.recordErrorAndShouldConsumeCredit(
                            "key", ENDPOINT, processingThrowable(), 200);

            assertThat(c1).isFalse();
            assertThat(c2).isFalse();
            assertThat(c3).isTrue();
            // user absent -> no save even at threshold crossing
            verify(errorTrackerRepository, never()).save(any());
        }

        @Test
        @DisplayName("null API key is tolerated on the DB fallback path")
        void nullApiKey_tolerated() {
            ErrorTrackingService service = dbService(2);
            when(userRepository.findByApiKey(eq(null))).thenReturn(Optional.empty());

            boolean charge =
                    service.recordErrorAndShouldConsumeCredit(
                            null, ENDPOINT, processingThrowable(), 200);

            assertThat(charge).isFalse();
            verify(errorTrackerRepository, never()).save(any());
        }
    }

    @Test
    @DisplayName("IOException as a system error type does not charge even at 200")
    void ioExceptionSystemError_doesNotCharge() {
        ErrorTrackingService service = cachedService(2);

        boolean charge =
                service.recordErrorAndShouldConsumeCredit(
                        API_KEY, ENDPOINT, new IOException("disk gone"), 200);

        assertThat(charge).isFalse();
        verify(errorTrackerRepository, never()).save(any());
    }
}
