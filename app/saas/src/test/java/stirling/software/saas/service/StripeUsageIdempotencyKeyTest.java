package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import stirling.software.saas.billing.service.StripeUsageReportingService;
import stirling.software.saas.config.SupabaseConfigurationProperties;

/**
 * Pins the shape of the Stripe meter-event idempotency key. The PAYG design and the PR #6384 review
 * both require this key to be deterministic across retries — same Supabase user, same overage
 * amount, same request → same key, so Stripe collapses duplicates.
 *
 * <p>If this contract slips (wall-clock millis sneak back in, fresh UUIDs per call, etc.) Stripe
 * stops deduping and customers get double-billed on a retry. Tests are cheap; the contract is
 * load-bearing.
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
        // Two debits of different sizes within the same request must not collapse — Stripe would
        // skip the second meter event otherwise.
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
        // Smoke check: make sure no future "simplification" silently drops a dimension.
        // Format today: usage_{supabaseId}_{credits}_{operationId}
        String key = service.generateIdempotencyKey("user-123", 42, "req-abc");

        assertThat(key).contains("user-123").contains("42").contains("req-abc");
    }
}
