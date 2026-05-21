package stirling.software.saas.billing.service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.config.SupabaseConfigurationProperties;

/**
 * Reports per-tenant overage to Stripe Billing Meters via the Supabase {@code meter-usage} Edge
 * Function. Only credits consumed above the free tier flow through {@link #reportUsageToStripe}.
 */
@Slf4j
@Service
@Profile("saas")
public class StripeUsageReportingService {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final SupabaseConfigurationProperties supabaseConfig;

    @Value("${supabase.url:}")
    private String supabaseUrl;

    private final HttpClient httpClient =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public StripeUsageReportingService(SupabaseConfigurationProperties supabaseConfig) {
        this.supabaseConfig = supabaseConfig;
    }

    /**
     * Reports a usage overage for a tenant. Returns {@code true} on a 200 response from Supabase,
     * {@code false} on any non-success outcome (including missing config). Caller should retry with
     * the same {@code idempotencyKey} on transient failures.
     */
    public boolean reportUsageToStripe(
            String supabaseId, int overageCredits, String idempotencyKey) {

        if (overageCredits <= 0) {
            log.warn(
                    "[USAGE-BILLING] non-positive overage {} for user {}",
                    overageCredits,
                    supabaseId);
            return false;
        }

        if (supabaseUrl == null || supabaseUrl.isEmpty()) {
            log.error(
                    "[USAGE-BILLING] supabase.url not configured; cannot report usage. Set SUPABASE_URL.");
            return false;
        }

        if (!supabaseConfig.isEdgeFunctionConfigured()) {
            log.error(
                    "[USAGE-BILLING] Supabase edge function not configured (URL + secret required); cannot report usage.");
            return false;
        }

        try {
            String meterUsageUrl = supabaseUrl + "/functions/v1/meter-usage";

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("user_id", supabaseId);
            requestBody.put("credits", overageCredits);
            requestBody.put("idempotency_key", idempotencyKey);
            String requestJson = objectMapper.writeValueAsString(requestBody);

            HttpRequest request =
                    HttpRequest.newBuilder()
                            .uri(URI.create(meterUsageUrl))
                            .header("Content-Type", "application/json")
                            .header(
                                    "Authorization",
                                    "Bearer " + supabaseConfig.getEdgeFunctionSecret())
                            .POST(HttpRequest.BodyPublishers.ofString(requestJson))
                            .timeout(Duration.ofSeconds(30))
                            .build();

            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                log.info(
                        "[USAGE-BILLING] reported {} overage credits for user {}",
                        overageCredits,
                        supabaseId);
                return true;
            }
            log.error(
                    "[USAGE-BILLING] failed to report usage HTTP {}: {}",
                    response.statusCode(),
                    response.body());
            return false;
        } catch (java.io.IOException e) {
            log.error(
                    "[USAGE-BILLING] network error reporting usage for {}: {}",
                    supabaseId,
                    e.getMessage(),
                    e);
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error(
                    "[USAGE-BILLING] interrupted reporting usage for {}: {}",
                    supabaseId,
                    e.getMessage());
            return false;
        } catch (Exception e) {
            log.error(
                    "[USAGE-BILLING] unexpected error reporting usage for {}: {}",
                    supabaseId,
                    e.getMessage(),
                    e);
            return false;
        }
    }

    /**
     * Idempotency key derived from the user + amount + operation. Stable across retries of the same
     * logical operation. Caller supplies a stable {@code operationId} (e.g. the request UUID
     * captured at the start of the credit-consume path) so a retry produces the same key.
     */
    public String generateIdempotencyKey(
            String supabaseId, int overageCredits, String operationId) {
        return String.format("usage_%s_%d_%s", supabaseId, overageCredits, operationId);
    }
}
