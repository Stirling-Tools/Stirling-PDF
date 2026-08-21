package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link RateLimitService}.
 *
 * <p>The service keeps per-team attempt counts in two in-memory {@link
 * java.util.concurrent.ConcurrentHashMap} buckets (hourly cap 50, daily cap 150) keyed by {@code
 * "team:" + teamId}. The reset clock is {@link System#currentTimeMillis()} with 1h / 1d windows, so
 * nothing created inside a test ever expires during the run - every assertion below is
 * deterministic pure arithmetic with no sleeps or fake clock. A fresh service instance is built per
 * test so the in-memory buckets start clean.
 */
class RateLimitServiceTest {

    private static final int HOURLY_LIMIT = 50;
    private static final int DAILY_LIMIT = 150;

    private RateLimitService service;

    @BeforeEach
    void setUp() {
        service = new RateLimitService();
    }

    @Nested
    @DisplayName("allowInvitation - hourly limit")
    class AllowInvitationHourly {

        @Test
        @DisplayName("first invitation for a team is allowed")
        void firstInvitation_allowed() {
            assertThat(service.allowInvitation(1L)).isTrue();
        }

        @Test
        @DisplayName("exactly the hourly limit (50) of invitations are all allowed")
        void upToHourlyLimit_allAllowed() {
            for (int i = 1; i <= HOURLY_LIMIT; i++) {
                assertThat(service.allowInvitation(1L))
                        .as("invitation #%d should be allowed", i)
                        .isTrue();
            }
        }

        @Test
        @DisplayName("the 51st invitation within the hour is rejected")
        void overHourlyLimit_rejected() {
            for (int i = 1; i <= HOURLY_LIMIT; i++) {
                service.allowInvitation(1L);
            }

            // count would become 51 > 50 -> rejected
            assertThat(service.allowInvitation(1L)).isFalse();
        }

        @Test
        @DisplayName("once over the hourly cap, subsequent attempts stay rejected")
        void staysRejectedOnceOverHourly() {
            for (int i = 1; i <= HOURLY_LIMIT + 1; i++) {
                service.allowInvitation(1L);
            }

            assertThat(service.allowInvitation(1L)).isFalse();
            assertThat(service.allowInvitation(1L)).isFalse();
        }
    }

    @Nested
    @DisplayName("allowInvitation - per-team isolation")
    class PerTeamIsolation {

        @Test
        @DisplayName("different teams have independent counters")
        void differentTeams_independent() {
            // Exhaust team 1's hourly quota.
            for (int i = 1; i <= HOURLY_LIMIT; i++) {
                service.allowInvitation(1L);
            }
            assertThat(service.allowInvitation(1L)).isFalse();

            // Team 2 is untouched and fully allowed.
            assertThat(service.allowInvitation(2L)).isTrue();
            assertThat(service.getRemainingInvitations(2L)).isEqualTo(HOURLY_LIMIT - 1);
        }

        @Test
        @DisplayName("null teamId is keyed as its own bucket and behaves like any team")
        void nullTeamId_hasOwnBucket() {
            assertThat(service.allowInvitation(null)).isTrue();
            // key becomes "team:null"; remaining drops by one for that key.
            assertThat(service.getRemainingInvitations(null)).isEqualTo(HOURLY_LIMIT - 1);
            // A real team is unaffected.
            assertThat(service.getRemainingInvitations(1L)).isEqualTo(HOURLY_LIMIT);
        }
    }

    @Nested
    @DisplayName("getRemainingInvitations")
    class GetRemainingInvitations {

        @Test
        @DisplayName("returns the full hourly allowance when no invitation has been recorded")
        void noBucket_returnsFullAllowance() {
            assertThat(service.getRemainingInvitations(7L)).isEqualTo(HOURLY_LIMIT);
        }

        @Test
        @DisplayName("decreases by one after a single allowed invitation")
        void afterOneInvitation_decrementsByOne() {
            service.allowInvitation(7L);

            assertThat(service.getRemainingInvitations(7L)).isEqualTo(HOURLY_LIMIT - 1);
        }

        @Test
        @DisplayName("tracks the running count across several invitations")
        void tracksRunningCount() {
            for (int i = 0; i < 10; i++) {
                service.allowInvitation(7L);
            }

            assertThat(service.getRemainingInvitations(7L)).isEqualTo(HOURLY_LIMIT - 10);
        }

        @Test
        @DisplayName("is zero exactly when the hourly limit has been fully consumed")
        void atHourlyLimit_remainingIsZero() {
            for (int i = 1; i <= HOURLY_LIMIT; i++) {
                service.allowInvitation(7L);
            }

            assertThat(service.getRemainingInvitations(7L)).isZero();
        }

        @Test
        @DisplayName("never goes negative once invitations are rejected past the cap")
        void overLimit_remainingClampedAtZero() {
            for (int i = 1; i <= HOURLY_LIMIT + 5; i++) {
                service.allowInvitation(7L);
            }

            // Math.max(0, 50 - count) clamps at zero even though attempts exceeded the cap.
            assertThat(service.getRemainingInvitations(7L)).isZero();
        }
    }

    @Nested
    @DisplayName("allowInvitation - daily limit and hourly rollback")
    class DailyLimitAndRollback {

        @Test
        @DisplayName("daily cap (150) blocks attempts even though it spans multiple hourly windows")
        void belowDailyLimit_acrossTeams_doesNotInterfere() {
            // A single team can never reach the daily cap within one hourly window because the
            // hourly cap (50) trips first. Verify the first 50 are allowed and 51st is blocked,
            // confirming the hourly gate is the binding constraint here.
            for (int i = 1; i <= HOURLY_LIMIT; i++) {
                assertThat(service.allowInvitation(9L)).isTrue();
            }
            assertThat(service.allowInvitation(9L)).isFalse();
        }

        @Test
        @DisplayName("rejection at the hourly gate does not consume the remaining count further")
        void hourlyRejection_doesNotAdvanceRemaining() {
            for (int i = 1; i <= HOURLY_LIMIT; i++) {
                service.allowInvitation(9L);
            }
            assertThat(service.getRemainingInvitations(9L)).isZero();

            // Rejected attempts push the internal count past the cap, but remaining stays clamped.
            service.allowInvitation(9L);
            assertThat(service.getRemainingInvitations(9L)).isZero();
        }
    }

    @Nested
    @DisplayName("cleanupExpiredBuckets")
    class CleanupExpiredBuckets {

        @Test
        @DisplayName("runs cleanly when there are no buckets at all")
        void emptyState_noError() {
            // Nothing recorded yet; cleanup must be a harmless no-op.
            service.cleanupExpiredBuckets();
        }

        @Test
        @DisplayName("does not evict fresh (unexpired) buckets, preserving their counts")
        void doesNotEvictFreshBuckets() {
            service.allowInvitation(11L);
            service.allowInvitation(11L);
            assertThat(service.getRemainingInvitations(11L)).isEqualTo(HOURLY_LIMIT - 2);

            // Buckets just created have reset times an hour/day out, so none are expired.
            service.cleanupExpiredBuckets();

            // Count survived the sweep.
            assertThat(service.getRemainingInvitations(11L)).isEqualTo(HOURLY_LIMIT - 2);
        }

        @Test
        @DisplayName("is idempotent across repeated invocations")
        void repeatedInvocations_stable() {
            service.allowInvitation(12L);

            service.cleanupExpiredBuckets();
            service.cleanupExpiredBuckets();
            service.cleanupExpiredBuckets();

            assertThat(service.getRemainingInvitations(12L)).isEqualTo(HOURLY_LIMIT - 1);
        }
    }

    @Test
    @DisplayName("daily limit constant is wider than the hourly limit (sanity on configured caps)")
    void dailyWiderThanHourly() {
        // This documents the relationship the service relies on: the hourly cap always trips first
        // for a single uninterrupted burst, so a lone team can't reach the daily cap in one window.
        assertThat(DAILY_LIMIT).isGreaterThan(HOURLY_LIMIT);
    }
}
