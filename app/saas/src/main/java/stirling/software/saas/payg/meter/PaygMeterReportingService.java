package stirling.software.saas.payg.meter;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.model.BillingCategory;

/**
 * POSTs PAYG billable usage to the Supabase {@code meter-payg-units} edge function. Called from
 * {@code JobChargeService.close()} in an {@code afterCommit} hook, so the wallet ledger DEBIT (the
 * customer's authoritative bill) is already durable before we tell Stripe about it.
 *
 * <p>Stripe is on a single flat-priced meter forever. {@link BillingCategory} ships as metadata for
 * analytics — pricing never reads it. Free-tier teams (no Stripe subscription) skip this call
 * entirely; the ledger entry is the only record needed.
 *
 * <p>Failure mode: we owe Stripe an event but the customer's bill via the ledger is correct. Log
 * WARN, bump {@code payg.meter.errors}, and swallow — the meter event log table on Supabase plus
 * the reconciliation job (separate chunk) is the durability story, not retries here. Caller's
 * {@code close()} must not roll back because Stripe wobbled.
 *
 * <p>Both config keys default to empty so unit tests / local dev never crash on missing env. When
 * blank, this service no-ops at WARN-debug level — useful for SaaS smoke tests that don't want to
 * touch the real edge function.
 */
@Service
@Profile("saas")
@Slf4j
public class PaygMeterReportingService {

    private final String endpoint;
    private final String serviceRoleToken;
    private final RestTemplate restTemplate;
    private final Counter errorsCounter;

    public PaygMeterReportingService(
            @Value("${payg.meter.endpoint:}") String endpoint,
            @Value("${payg.meter.service-role-token:}") String serviceRoleToken,
            RestTemplate saasRestTemplate,
            MeterRegistry meterRegistry) {
        this.endpoint = endpoint;
        this.serviceRoleToken = serviceRoleToken;
        this.restTemplate = saasRestTemplate;
        this.errorsCounter =
                Counter.builder("payg.meter.errors")
                        .description("Failures POSTing PAYG meter events to Supabase edge function")
                        .register(meterRegistry);
    }

    /**
     * Best-effort POST of a single billable event. Idempotency on the Supabase side is keyed on
     * {@code idempotency_key} — supply a deterministic value (e.g. {@code "process:<uuid>:close"})
     * so a retry, a reconciliation replay, or a double-fire from two pods never charges twice.
     *
     * <p>Never throws. The wallet ledger entry is the source of truth for what the customer is
     * billed; if this method fails the only loss is that Stripe doesn't see this event until the
     * reconciliation backfill runs.
     */
    public void recordUsage(
            Long teamId,
            String stripeCustomerId,
            int units,
            BillingCategory category,
            String idempotencyKey) {
        if (endpoint == null || endpoint.isBlank()) {
            log.debug(
                    "payg.meter.endpoint not configured; skipping meter event for team {} key {}",
                    teamId,
                    idempotencyKey);
            return;
        }
        if (units <= 0) {
            // Zero-unit events would inflate event count without changing the bill — defensive.
            log.debug(
                    "Skipping meter event with units={} for team {} key {}",
                    units,
                    teamId,
                    idempotencyKey);
            return;
        }
        try {
            HttpHeaders headers = new HttpHeaders();
            if (serviceRoleToken != null && !serviceRoleToken.isBlank()) {
                headers.setBearerAuth(serviceRoleToken);
            }
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> body =
                    Map.of(
                            "team_id",
                            teamId == null ? "" : teamId.toString(),
                            "stripe_customer_id",
                            stripeCustomerId == null ? "" : stripeCustomerId,
                            "units",
                            units,
                            "idempotency_key",
                            idempotencyKey,
                            "metadata",
                            Map.of("category", category == null ? "UNKNOWN" : category.name()));

            ResponseEntity<String> response =
                    restTemplate.exchange(
                            endpoint,
                            HttpMethod.POST,
                            new HttpEntity<>(body, headers),
                            String.class);

            if (!response.getStatusCode().is2xxSuccessful()) {
                log.warn(
                        "Meter event POST returned {} for team {} key {}: {}",
                        response.getStatusCode(),
                        teamId,
                        idempotencyKey,
                        response.getBody());
                errorsCounter.increment();
            }
        } catch (Exception e) {
            // Catch-all by design: this method MUST NOT propagate. The customer's bill via the
            // ledger is correct; we just owe Stripe an event we'll backfill via reconciliation.
            log.warn(
                    "Meter event POST failed for team {} key {}: {}",
                    teamId,
                    idempotencyKey,
                    e.getMessage());
            errorsCounter.increment();
        }
    }
}
