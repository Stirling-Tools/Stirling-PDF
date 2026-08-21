package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import stirling.software.saas.billing.service.StripeUsageReportingService;
import stirling.software.saas.config.SupabaseConfigurationProperties;

/**
 * Pins the Stripe meter-event idempotency key as a deterministic function of (Supabase user,
 * overage amount, request id). Stripe collapses duplicates by this key, so a regression here means
 * customers get double-billed on a retry.
 */
class StripeUsageIdempotencyKeyTest {

    private final StripeUsageReportingService service =
            new StripeUsageReportingService(Mockito.mock(SupabaseConfigurationProperties.class));

    @Test
    void sameInputs_produceSameKey() {
        String first = service.generateIdempotencyKey("user-123", 10, "req-abc");
        String second = service.generateIdempotencyKey("user-123", 10, "req-abc");

        assertThat(first)
                .as("Idempotency key must be stable across calls with identical inputs.")
                .isEqualTo(second);
    }

    @Test
    void differentRequestIds_produceDifferentKeys() {
        String reqA = service.generateIdempotencyKey("user-123", 10, "req-abc");
        String reqB = service.generateIdempotencyKey("user-123", 10, "req-xyz");

        assertThat(reqA).isNotEqualTo(reqB);
    }

    @Test
    void differentOverageAmounts_produceDifferentKeys() {
        String tenCredits = service.generateIdempotencyKey("user-123", 10, "req-abc");
        String elevenCredits = service.generateIdempotencyKey("user-123", 11, "req-abc");

        assertThat(tenCredits).isNotEqualTo(elevenCredits);
    }

    @Test
    void differentUsers_produceDifferentKeys() {
        String alice = service.generateIdempotencyKey("user-alice", 10, "req-abc");
        String bob = service.generateIdempotencyKey("user-bob", 10, "req-abc");

        assertThat(alice).isNotEqualTo(bob);
    }

    @Test
    void keyShapeIncludesAllThreeDimensions() {
        // Format: usage_{supabaseId}_{credits}_{operationId}
        String key = service.generateIdempotencyKey("user-123", 42, "req-abc");

        assertThat(key).contains("user-123").contains("42").contains("req-abc");
    }
}
