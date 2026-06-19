package stirling.software.proprietary.service;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

/**
 * Reads the {@code error} sentinel and {@code subscribed} flag out of a downstream 401/402 JSON
 * body - e.g. the saas EntitlementGuard's {@code
 * {"error":"PAYG_LIMIT_REACHED","subscribed":false}}.
 *
 * <p>Server-side run paths (policy auto-run, AI agent workflows) execute tool calls via loopback
 * HTTP. The migrated {@code InternalApiClient} returns the upstream status as a {@link Response}
 * (it does not throw), so the policy executor rethrows a non-OK tool response as a {@link
 * WebApplicationException} carrying that status + body. These helpers let those paths pass the
 * structured code through to the client, which maps it to the right usage-limit modal instead of
 * showing a generic failure.
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
    public static String extractCode(WebApplicationException e) {
        Response response = e.getResponse();
        if (response == null) {
            return null;
        }
        return extractCode(response.getStatus(), bodyOf(response));
    }

    /**
     * Status + body overload, for callers that already have the upstream {@link Response} fields.
     */
    public static String extractCode(int status, String body) {
        if (status != 401 && status != 402) {
            return null;
        }
        if (body == null || body.isBlank()) {
            return null;
        }
        Matcher m = ERROR_CODE_FIELD.matcher(body);
        return m.find() ? m.group(1) : null;
    }

    /**
     * Pull the {@code subscribed} flag out of the body (present on the saas {@code
     * PAYG_LIMIT_REACHED}/{@code FEATURE_DEGRADED} responses). Null when absent - the client then
     * defaults to the free-limit modal.
     */
    public static Boolean extractSubscribed(WebApplicationException e) {
        Response response = e.getResponse();
        return response == null ? null : extractSubscribed(bodyOf(response));
    }

    /** Body overload, for callers that already have the upstream response body. */
    public static Boolean extractSubscribed(String body) {
        if (body == null || body.isBlank()) {
            return null;
        }
        Matcher m = SUBSCRIBED_FIELD.matcher(body);
        return m.find() ? Boolean.valueOf(m.group(1)) : null;
    }

    private static String bodyOf(Response response) {
        Object entity = response.getEntity();
        return entity == null ? null : entity.toString();
    }
}
