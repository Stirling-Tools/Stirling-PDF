package stirling.software.proprietary.service;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.web.client.RestClientResponseException;

/**
 * Reads the {@code error} sentinel and {@code subscribed} flag out of a downstream 401/402 JSON
 * body — e.g. the saas EntitlementGuard's {@code
 * {"error":"PAYG_LIMIT_REACHED","subscribed":false}}.
 *
 * <p>Server-side run paths (policy auto-run, AI agent workflows) execute tool calls via loopback
 * HTTP, so a usage-limit 402 surfaces as a {@link RestClientResponseException} rather than reaching
 * the frontend's API-client interceptor. These helpers let those paths pass the structured code
 * through to the client, which maps it to the right usage-limit modal instead of showing a generic
 * failure.
 *
 * <p>Regex (not a JSON parse) on purpose: the body is a small, server-controlled shape and this
 * keeps the proprietary module free of any billing-layer (saas) coupling.
 */
public final class DownstreamEntitlementError {

    private DownstreamEntitlementError() {}

    /** Matches the {@code "error":"CODE"} field of a small JSON error body. */
    private static final Pattern ERROR_CODE_FIELD =
            Pattern.compile("\"error\"\\s*:\\s*\"([^\"]+)\"");

    /** Matches the {@code "subscribed":true|false} field of a small JSON error body. */
    private static final Pattern SUBSCRIBED_FIELD =
            Pattern.compile("\"subscribed\"\\s*:\\s*(true|false)");

    /**
     * Pull the {@code error} sentinel out of a downstream 401/402 JSON body. Returns null for other
     * statuses or an unmatched body, in which case the caller treats it as a generic failure.
     */
    public static String extractCode(RestClientResponseException e) {
        int status = e.getStatusCode().value();
        if (status != 401 && status != 402) {
            return null;
        }
        String body = e.getResponseBodyAsString();
        if (body == null || body.isBlank()) {
            return null;
        }
        Matcher m = ERROR_CODE_FIELD.matcher(body);
        return m.find() ? m.group(1) : null;
    }

    /**
     * Pull the {@code subscribed} flag out of the body (present on the saas {@code
     * PAYG_LIMIT_REACHED}/{@code FEATURE_DEGRADED} responses). Null when absent — the client then
     * defaults to the free-limit modal.
     */
    public static Boolean extractSubscribed(RestClientResponseException e) {
        String body = e.getResponseBodyAsString();
        if (body == null || body.isBlank()) {
            return null;
        }
        Matcher m = SUBSCRIBED_FIELD.matcher(body);
        return m.find() ? Boolean.valueOf(m.group(1)) : null;
    }
}
