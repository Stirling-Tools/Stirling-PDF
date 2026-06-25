package stirling.software.proprietary.accountlink;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Outbound calls from a self-hosted instance to its linked SaaS backend (combined-billing "Mode
 * A").
 *
 * <p>Two calls:
 *
 * <ul>
 *   <li>{@link #register} — relays the admin's short-lived Supabase JWT to {@code POST
 *       /api/v1/account-link/register}; the SaaS side mints + returns a device credential.
 *   <li>{@link #fetchEntitlement} — authenticates with the stored device credential against {@code
 *       GET /api/v1/instance/entitlement}; what the local gate consults.
 * </ul>
 *
 * <p>Uses {@code java.net.http.HttpClient} (the established self-hosted outbound pattern, see
 * {@code AiEngineClient}). The base URL + client are injectable so tests can stub the SaaS
 * endpoint.
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class AccountLinkClient {

    static final String HEADER_DEVICE_ID = "X-Device-Id";
    static final String HEADER_DEVICE_SECRET = "X-Device-Secret";

    private final AccountLinkProperties properties;
    private final ObjectMapper mapper;
    private final HttpClient httpClient;

    @Autowired
    public AccountLinkClient(AccountLinkProperties properties, ObjectMapper mapper) {
        this(
                properties,
                mapper,
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(properties.getRequestTimeoutSeconds()))
                        .build());
    }

    /** Package-private: lets tests inject a stub {@link HttpClient}. */
    AccountLinkClient(
            AccountLinkProperties properties, ObjectMapper mapper, HttpClient httpClient) {
        this.properties = properties;
        this.mapper = mapper;
        this.httpClient = httpClient;
    }

    /** The device credential a successful {@link #register} returns. */
    public record RegisterResult(String deviceId, String deviceSecret, Long teamId) {}

    /**
     * A non-2xx reply from the SaaS account-link API. Carries the upstream status so the caller can
     * map auth failures (401/403) through rather than masking everything as a 502.
     */
    public static class UpstreamException extends IOException {
        private final int status;

        public UpstreamException(int status, String body) {
            super("SaaS account-link returned HTTP " + status + ": " + body);
            this.status = status;
        }

        public int status() {
            return status;
        }
    }

    /**
     * Authoritative deny (401/403) from the entitlement endpoint — the device credential is revoked
     * or invalid. Distinct from a transport/server failure (which returns {@code null} and fails
     * open): the cache must BLOCK billable work on this rather than serve a stale entitled
     * snapshot. Unchecked so it propagates cleanly through {@link #fetchEntitlement}'s transport
     * try/catch.
     */
    public static final class RevokedException extends RuntimeException {
        private final int status;

        public RevokedException(int status) {
            super("SaaS entitlement denied (credential revoked/invalid): HTTP " + status);
            this.status = status;
        }

        public int status() {
            return status;
        }
    }

    /**
     * Relays the admin Supabase JWT to the SaaS register endpoint and returns the minted
     * credential.
     *
     * @throws IOException on transport failure or a non-2xx response (caller surfaces to the
     *     admin).
     */
    public RegisterResult register(String supabaseJwt, String instanceName) throws IOException {
        String body =
                instanceName == null || instanceName.isBlank()
                        ? "{}"
                        : "{\"name\":" + mapper.writeValueAsString(instanceName) + "}";
        HttpRequest request =
                HttpRequest.newBuilder()
                        .uri(uri("/api/v1/account-link/register"))
                        .header("Authorization", "Bearer " + supabaseJwt)
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .timeout(timeout())
                        .POST(HttpRequest.BodyPublishers.ofString(body))
                        .build();

        HttpResponse<String> response = send(request);
        if (response.statusCode() / 100 != 2) {
            throw new UpstreamException(response.statusCode(), response.body());
        }
        JsonNode root = mapper.readTree(response.body());
        String deviceId = text(root, "deviceId");
        String deviceSecret = text(root, "deviceSecret");
        if (deviceId == null || deviceSecret == null) {
            throw new IOException("SaaS register response missing deviceId/deviceSecret");
        }
        Long teamId = root.hasNonNull("teamId") ? root.get("teamId").asLong() : null;
        return new RegisterResult(deviceId, deviceSecret, teamId);
    }

    /**
     * Revokes this instance's own credential on the SaaS side ({@code POST
     * /api/v1/instance/revoke-self}), authenticated by the device credential — a credential is
     * allowed to revoke its own identity. Best-effort: returns {@code false} if SaaS is unreachable
     * or rejects the call, so the caller (local unlink) can still clear locally and log the orphan
     * row for follow-up. Idempotent on SaaS (already-revoked → still 204).
     */
    public boolean revokeSelf(String deviceId, String deviceSecret) {
        try {
            HttpRequest request =
                    HttpRequest.newBuilder()
                            .uri(uri("/api/v1/instance/revoke-self"))
                            .header(HEADER_DEVICE_ID, deviceId)
                            .header(HEADER_DEVICE_SECRET, deviceSecret)
                            .header("Accept", "application/json")
                            .timeout(timeout())
                            .POST(HttpRequest.BodyPublishers.noBody())
                            .build();
            HttpResponse<String> response = send(request);
            if (response.statusCode() / 100 != 2) {
                log.debug("Self-revoke returned HTTP {}", response.statusCode());
                return false;
            }
            return true;
        } catch (Exception e) {
            log.debug("Self-revoke failed: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Fetches the current entitlement using the stored device credential. Three outcomes:
     *
     * <ul>
     *   <li>2xx → the parsed snapshot.
     *   <li>401/403 → {@link RevokedException} (authoritative deny — revoked/invalid credential);
     *       the caller must BLOCK, not fail open.
     *   <li>transport failure, other non-2xx (e.g. 5xx), or a malformed body → {@code null}
     *       ("unknown" — the caller fails open).
     * </ul>
     */
    public InstanceEntitlement fetchEntitlement(String deviceId, String deviceSecret) {
        HttpResponse<String> response;
        try {
            HttpRequest request =
                    HttpRequest.newBuilder()
                            .uri(uri("/api/v1/instance/entitlement"))
                            .header(HEADER_DEVICE_ID, deviceId)
                            .header(HEADER_DEVICE_SECRET, deviceSecret)
                            .header("Accept", "application/json")
                            .timeout(timeout())
                            .GET()
                            .build();
            response = send(request);
        } catch (Exception e) {
            // Transport failure (timeout / connection refused / interrupted) → unknown, fail open.
            log.debug("Entitlement fetch failed: {}", e.getMessage());
            return null;
        }
        int status = response.statusCode();
        if (status == 401 || status == 403) {
            // Authoritative deny — the SaaS side rejected the credential (revoked/invalid).
            throw new RevokedException(status);
        }
        if (status / 100 != 2) {
            // Server / transient error → unknown, fail open (do NOT treat as a deny).
            log.debug("Entitlement fetch returned HTTP {}", status);
            return null;
        }
        try {
            return parseEntitlement(response.body());
        } catch (IOException e) {
            log.debug("Entitlement parse failed: {}", e.getMessage());
            return null;
        }
    }

    private InstanceEntitlement parseEntitlement(String body) throws IOException {
        JsonNode root = mapper.readTree(body);
        boolean subscribed = root.path("subscribed").asBoolean(false);
        long freeRemaining = root.path("freeRemainingUnits").asLong(0);
        long periodSpend = root.path("periodSpendUnits").asLong(0);
        Long periodCap =
                root.hasNonNull("periodCapUnits") ? root.get("periodCapUnits").asLong() : null;
        EntitlementState state = mapState(root.path("state").asText(null));
        return new InstanceEntitlement(subscribed, freeRemaining, periodSpend, periodCap, state);
    }

    /** Maps the SaaS state string to our coarse enum; unrecognised → UNKNOWN. */
    private static EntitlementState mapState(String raw) {
        if (raw == null) {
            return EntitlementState.UNKNOWN;
        }
        return switch (raw) {
            case "OK", "ACTIVE", "SUBSCRIBED", "FREE" -> EntitlementState.OK;
            case "OVER_LIMIT", "PAYG_LIMIT_REACHED", "BLOCKED" -> EntitlementState.OVER_LIMIT;
            default -> EntitlementState.UNKNOWN;
        };
    }

    private HttpResponse<String> send(HttpRequest request) throws IOException {
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Interrupted calling SaaS account-link", e);
        }
    }

    private URI uri(String path) {
        String base = properties.getSaasBaseUrl().strip().replaceAll("/+$", "");
        return URI.create(base + path);
    }

    private Duration timeout() {
        return Duration.ofSeconds(properties.getRequestTimeoutSeconds());
    }

    private static String text(JsonNode node, String field) {
        return node.hasNonNull(field) ? node.get(field).asText() : null;
    }
}
