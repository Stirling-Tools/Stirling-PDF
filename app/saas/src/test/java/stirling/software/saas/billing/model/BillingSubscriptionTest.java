package stirling.software.saas.billing.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/** Accessor and isActive/isValid branch tests for the BillingSubscription Stripe mirror entity. */
class BillingSubscriptionTest {

    private static BillingSubscription withStatus(String status) {
        BillingSubscription sub = new BillingSubscription();
        sub.setStatus(status);
        return sub;
    }

    @Test
    @DisplayName("every setter round-trips through its getter")
    void settersRoundTrip() {
        UUID userId = UUID.randomUUID();
        LocalDateTime periodEnd = LocalDateTime.of(2026, 7, 1, 0, 0);
        LocalDateTime created = LocalDateTime.of(2026, 6, 1, 0, 0);
        LocalDateTime updated = LocalDateTime.of(2026, 6, 2, 0, 0);

        BillingSubscription sub = new BillingSubscription();
        sub.setId("sub_123");
        sub.setUserId(userId);
        sub.setTeamId(7L);
        sub.setStatus("active");
        sub.setPriceId("price_abc");
        sub.setCurrentPeriodEnd(periodEnd);
        sub.setCreatedAt(created);
        sub.setUpdatedAt(updated);

        assertThat(sub.getId()).isEqualTo("sub_123");
        assertThat(sub.getUserId()).isEqualTo(userId);
        assertThat(sub.getTeamId()).isEqualTo(7L);
        assertThat(sub.getStatus()).isEqualTo("active");
        assertThat(sub.getPriceId()).isEqualTo("price_abc");
        assertThat(sub.getCurrentPeriodEnd()).isEqualTo(periodEnd);
        assertThat(sub.getCreatedAt()).isEqualTo(created);
        assertThat(sub.getUpdatedAt()).isEqualTo(updated);
    }

    @Nested
    @DisplayName("isActive")
    class IsActive {

        @Test
        @DisplayName("true for active, trialing, and past_due (case-insensitive)")
        void activeStatuses() {
            assertThat(withStatus("active").isActive()).isTrue();
            assertThat(withStatus("ACTIVE").isActive()).isTrue();
            assertThat(withStatus("trialing").isActive()).isTrue();
            assertThat(withStatus("Past_Due").isActive()).isTrue();
        }

        @Test
        @DisplayName("false for canceled and unknown statuses")
        void inactiveStatuses() {
            assertThat(withStatus("canceled").isActive()).isFalse();
            assertThat(withStatus("incomplete_expired").isActive()).isFalse();
        }
    }

    @Nested
    @DisplayName("isValid")
    class IsValid {

        @Test
        @DisplayName("active with a null period end is valid (open-ended)")
        void activeNullPeriodEnd() {
            BillingSubscription sub = withStatus("active");
            assertThat(sub.getCurrentPeriodEnd()).isNull();
            assertThat(sub.isValid()).isTrue();
        }

        @Test
        @DisplayName("active with a future period end is valid")
        void activeFuturePeriodEnd() {
            BillingSubscription sub = withStatus("active");
            sub.setCurrentPeriodEnd(LocalDateTime.now().plusDays(5));
            assertThat(sub.isValid()).isTrue();
        }

        @Test
        @DisplayName("active but past the period end is not valid")
        void activeExpiredPeriodEnd() {
            BillingSubscription sub = withStatus("active");
            sub.setCurrentPeriodEnd(LocalDateTime.now().minusDays(1));
            assertThat(sub.isValid()).isFalse();
        }

        @Test
        @DisplayName("inactive status is never valid even with a future period end")
        void inactiveNeverValid() {
            BillingSubscription sub = withStatus("canceled");
            sub.setCurrentPeriodEnd(LocalDateTime.now().plusDays(5));
            assertThat(sub.isValid()).isFalse();
        }
    }
}
