package stirling.software.saas.payg.cancellation;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.config.SupabaseConfigurationProperties;

/**
 * Calls the internal {@code subscription-cancellation} edge function, the one step that needs
 * Stripe's secret key: it schedules or withdraws the cancel and emails the confirmation. Everything
 * before (who may cancel, which subscriptions, why) and after (the event log) stays in this app.
 */
@Slf4j
@Component
@Profile("saas")
@RequiredArgsConstructor
public class CancellationEdgeClient {

    public record Target(String product, String subscriptionId) {}

    /** {@code changed} is true only for the subscriptions this call actually moved. */
    public record Result(
            String product,
            String subscriptionId,
            String status,
            boolean cancelling,
            String endsAt,
            String periodEnd,
            boolean changed) {}

    private final SupabaseConfigurationProperties supabase;
    private final RestTemplate restTemplate;

    public List<Result> change(
            String action,
            String customerId,
            String teamName,
            List<Target> targets,
            CancelReason reason,
            String comment,
            String notifyEmail) {
        if (!supabase.isEdgeFunctionConfigured()) {
            log.warn("Edge functions are not configured; cannot {} a subscription", action);
            throw new CancellationException(HttpStatus.SERVICE_UNAVAILABLE, "unavailable");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("action", action);
        body.put("customer", customerId);
        if (teamName != null) body.put("team_name", teamName);
        body.put(
                "subscriptions",
                targets.stream()
                        .map(t -> Map.of("product", t.product(), "id", t.subscriptionId()))
                        .toList());
        if (reason != null) {
            body.put("feedback", reason.stripeFeedback());
            body.put("reason", reason.code());
            body.put("reason_label", reason.label());
        }
        if (comment != null) body.put("comment", comment);
        if (notifyEmail != null) body.put("notify_email", notifyEmail);

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(supabase.getEdgeFunctionSecret());
        headers.setContentType(MediaType.APPLICATION_JSON);
        Map<?, ?> response;
        try {
            response =
                    restTemplate.postForObject(
                            supabase.getEdgeFunctionUrl() + "/subscription-cancellation",
                            new HttpEntity<>(body, headers),
                            Map.class);
        } catch (RestClientException e) {
            log.warn("subscription-cancellation {} failed: {}", action, e.getMessage());
            throw new CancellationException(HttpStatus.BAD_GATEWAY, "stripe_unavailable");
        }
        if (response == null || !(response.get("subscriptions") instanceof List<?> rows)) {
            throw new CancellationException(HttpStatus.BAD_GATEWAY, "stripe_unavailable");
        }
        List<Result> results = new ArrayList<>();
        for (Object row : rows) {
            if (row instanceof Map<?, ?> m) {
                results.add(
                        new Result(
                                String.valueOf(m.get("product")),
                                String.valueOf(m.get("subscription_id")),
                                String.valueOf(m.get("status")),
                                Boolean.TRUE.equals(m.get("cancel_at_period_end")),
                                m.get("ends_at") instanceof String s ? s : null,
                                m.get("period_end") instanceof String s ? s : null,
                                Boolean.TRUE.equals(m.get("changed"))));
            }
        }
        return results;
    }
}
