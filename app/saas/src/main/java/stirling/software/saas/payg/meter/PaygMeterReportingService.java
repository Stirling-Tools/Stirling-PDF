package stirling.software.saas.payg.meter;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

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
 * PaygMeterReconcileScheduler}, which retries unposted rows, not from retries here.
 *
 * <p>Both config keys default to empty so unit tests / local dev never crash on missing env. When
 * blank, this service no-ops at WARN-debug level.
 */
@ApplicationScoped
@IfBuildProfile("saas")
@Slf4j
public class PaygMeterReportingService {

    private final String endpoint;
    private final String authToken;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final PaygMeterEventLogRepository eventLogRepository;
    private final Counter errorsCounter;

    /** Stripe error bodies can be large; the column is TEXT but we cap to keep rows sane. */
    private static final int MAX_ERROR_BODY = 4000;

    @Inject
    public PaygMeterReportingService(
            @ConfigProperty(name = "payg.meter.endpoint", defaultValue = "") String endpoint,
            @ConfigProperty(name = "payg.meter.auth-token", defaultValue = "") String authToken,
            PaygMeterEventLogRepository eventLogRepository,
            MeterRegistry meterRegistry) {
        this.endpoint = endpoint;
        this.authToken = authToken;
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
     * then stamp the row posted or record the Stripe error.
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
        // can retry. Idempotent insert (ON CONFLICT DO NOTHING). Best-effort: a logging failure
        // must never stop us from actually metering.
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
            String json = objectMapper.writeValueAsString(body);

            HttpRequest.Builder builder =
                    HttpRequest.newBuilder()
                            .uri(URI.create(endpoint))
                            .header("Content-Type", "application/json")
                            .timeout(Duration.ofSeconds(30))
                            .POST(HttpRequest.BodyPublishers.ofString(json));
            if (authToken != null && !authToken.isBlank()) {
                builder.header("Authorization", "Bearer " + authToken);
            }

            HttpResponse<String> response =
                    httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());

            int statusCode = response.statusCode();
            if (statusCode >= 200 && statusCode < 300) {
                return PostOutcome.ok();
            }
            log.warn(
                    "Meter event POST returned {} for team {} key {}: {}",
                    statusCode,
                    teamId,
                    idempotencyKey,
                    response.body());
            errorsCounter.increment();
            return PostOutcome.error(String.valueOf(statusCode), response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn(
                    "Meter event POST interrupted for team {} key {}: {}",
                    teamId,
                    idempotencyKey,
                    e.getMessage());
            errorsCounter.increment();
            return PostOutcome.error("exception", e.getMessage());
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
