package stirling.software.saas.payg.meter;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Accessor coverage for the PaygMeterEventLog audit row entity. */
class PaygMeterEventLogTest {

    @Test
    @DisplayName("a fresh row is unposted with no Stripe error captured")
    void freshRowIsPending() {
        PaygMeterEventLog log = new PaygMeterEventLog();
        assertThat(log.getPostedToStripeAt()).isNull();
        assertThat(log.getStripeErrorCode()).isNull();
        assertThat(log.getStripeErrorBody()).isNull();
    }

    @Test
    @DisplayName("every setter round-trips through its getter")
    void settersRoundTrip() {
        UUID jobId = UUID.randomUUID();
        LocalDateTime occurred = LocalDateTime.of(2026, 6, 1, 0, 0);
        LocalDateTime posted = LocalDateTime.of(2026, 6, 1, 0, 5);

        PaygMeterEventLog log = new PaygMeterEventLog();
        log.setEventId(7L);
        log.setTeamId(42L);
        log.setJobId(jobId);
        log.setIdempotencyKey("process:abc:close");
        log.setUnits(4);
        log.setOccurredAt(occurred);
        log.setPostedToStripeAt(posted);
        log.setStripeErrorCode("rate_limit");
        log.setStripeErrorBody("{\"error\":\"too many requests\"}");

        assertThat(log.getEventId()).isEqualTo(7L);
        assertThat(log.getTeamId()).isEqualTo(42L);
        assertThat(log.getJobId()).isEqualTo(jobId);
        assertThat(log.getIdempotencyKey()).isEqualTo("process:abc:close");
        assertThat(log.getUnits()).isEqualTo(4);
        assertThat(log.getOccurredAt()).isEqualTo(occurred);
        assertThat(log.getPostedToStripeAt()).isEqualTo(posted);
        assertThat(log.getStripeErrorCode()).isEqualTo("rate_limit");
        assertThat(log.getStripeErrorBody()).contains("too many requests");
    }
}
