package stirling.software.saas.payg.meter;

import java.util.Map;
import java.util.UUID;

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
import stirling.software.saas.payg.repository.PaygMeterEventLogRepository;

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
 * WARN, bump {@code payg.meter.errors}, and swallow — durability comes from the {@code
 * payg_meter_event_log} row written around every attempt (pending → posted/failed) and {@link
 * PaygMeterReconcileScheduler}, which retries unposted rows, not from retries here. Caller's {@code
 * close()} must not roll back because Stripe wobbled.
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
    private final String authToken;
    private final RestTemplate restTemplate;
    private final PaygMeterEventLogRepository eventLogRepository;
    private final Counter errorsCounter;

    /** Stripe error bodies can be large; the column is TEXT but we cap to keep rows sane. */
    private static final int MAX_ERROR_BODY = 4000;

    public PaygMeterReportingService(
            @Value("${payg.meter.endpoint:}") String endpoint,
            @Value("${payg.meter.auth-token:}") String authToken,
            RestTemplate saasRestTemplate,
            PaygMeterEventLogRepository eventLogRepository,
            MeterRegistry meterRegistry) {
        this.endpoint = endpoint;
        this.authToken = authToken;
        this.restTemplate = saasRestTemplate;
        this.eventLogRepository = eventLogRepository;
        this.errorsCounter =
                Counter.builder("payg.meter.errors")
                        .description("Failures POSTing PAYG meter events to Supabase edge function")
                        .register(meterRegistry);
    }

    /**
     * Best-effort POST of a single billable event, wrapped in a durable audit row. Idempotency on
     * the Supabase side is keyed on {@code idempotency_key} — supply a deterministic value (e.g.
     * {@code "process:<uuid>:close"}) so a retry, a reconcile replay, or a double-fire from two
     * pods never charges twice.
     *
     * <p>Flow: write a pending {@code payg_meter_event_log} row (idempotent), POST to the edge fn,
     * then stamp the row posted or record the Stripe error. The row is what {@link
     * PaygMeterReconcileScheduler} retries, so a failed POST is recoverable rather than silently
     * dropped.
     *
     * <p>Never throws. The wallet ledger entry is the source of truth for what the customer is
     * billed; if the POST fails the only loss is that Stripe doesn't see this event until reconcile
     * retries it.
     */
    public void recordUsage(
            Long teamId,
            String stripeCustomerId,
            int units,
            BillingCategory category,
            String idempotencyKey,
            UUID jobId) {
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

        // Durable pending row before the POST so a failure leaves a record the reconcile scheduler
        // can retry. Idempotent insert (ON CONFLICT DO NOTHING) — the completion + stale-close
        // triggers and reconcile retries all share the key. Best-effort: a logging failure must
        // never stop us from actually metering.
        try {
            eventLogRepository.insertPending(teamId, jobId, idempotencyKey, units);
        } catch (Exception e) {
            log.warn(
                    "payg_meter_event_log pending insert failed for key {} (still metering): {}",
                    idempotencyKey,
                    e.getMessage());
        }

        PostOutcome outcome =
                postToStripe(teamId, stripeCustomerId, units, category, idempotencyKey);

        try {
            if (outcome.success()) {
                eventLogRepository.markPosted(idempotencyKey);
            } else {
                eventLogRepository.markFailed(
                        idempotencyKey, outcome.errorCode(), outcome.errorBody());
            }
        } catch (Exception e) {
            log.warn(
                    "payg_meter_event_log result update failed for key {}: {}",
                    idempotencyKey,
                    e.getMessage());
        }
    }

    /**
     * POST the event to the edge fn. Never throws; returns success / the captured Stripe error.
     * Increments {@code payg.meter.errors} on any non-2xx or exception (unchanged metric contract).
     */
    private PostOutcome postToStripe(
            Long teamId,
            String stripeCustomerId,
            int units,
            BillingCategory category,
            String idempotencyKey) {
        try {
            HttpHeaders headers = new HttpHeaders();
            if (authToken != null && !authToken.isBlank()) {
                headers.setBearerAuth(authToken);
            }
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, Object> body =
                    Map.of(
                            "team_id",
                            // JSON number — the edge fn type-checks and ignores strings.
                            teamId == null ? -1L : teamId,
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

            if (response.getStatusCode().is2xxSuccessful()) {
                return PostOutcome.ok();
            }
            log.warn(
                    "Meter event POST returned {} for team {} key {}: {}",
                    response.getStatusCode(),
                    teamId,
                    idempotencyKey,
                    response.getBody());
            errorsCounter.increment();
            return PostOutcome.error(
                    String.valueOf(response.getStatusCode().value()), response.getBody());
        } catch (Exception e) {
            // Catch-all by design: this method MUST NOT propagate. The customer's bill via the
            // ledger is correct; we just owe Stripe an event the reconcile scheduler will retry.
            log.warn(
                    "Meter event POST failed for team {} key {}: {}",
                    teamId,
                    idempotencyKey,
                    e.getMessage());
            errorsCounter.increment();
            return PostOutcome.error("exception", e.getMessage());
        }
    }

    /** Outcome of one edge-fn POST attempt. */
    private record PostOutcome(boolean success, String errorCode, String errorBody) {
        static PostOutcome ok() {
            return new PostOutcome(true, null, null);
        }

        static PostOutcome error(String code, String body) {
            String trimmedCode = code != null && code.length() > 64 ? code.substring(0, 64) : code;
            String trimmedBody =
                    body != null && body.length() > MAX_ERROR_BODY
                            ? body.substring(0, MAX_ERROR_BODY)
                            : body;
            return new PostOutcome(false, trimmedCode, trimmedBody);
        }
    }
}
