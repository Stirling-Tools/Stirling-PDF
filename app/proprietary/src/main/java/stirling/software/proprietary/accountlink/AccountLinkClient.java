package stirling.software.proprietary.accountlink;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

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
            throw new IOException(
                    "SaaS register returned HTTP "
                            + response.statusCode()
                            + ": "
                            + response.body());
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
     * Fetches the current entitlement using the stored device credential. Returns the parsed
     * snapshot, or {@code null} when the SaaS side is unreachable / returns an error — the caller
     * (cache + gate) treats {@code null} as "unknown" and fails open.
     */
    public InstanceEntitlement fetchEntitlement(String deviceId, String deviceSecret) {
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
            HttpResponse<String> response = send(request);
            if (response.statusCode() / 100 != 2) {
                log.debug("Entitlement fetch returned HTTP {}", response.statusCode());
                return null;
            }
            return parseEntitlement(response.body());
        } catch (Exception e) {
            log.debug("Entitlement fetch failed: {}", e.getMessage());
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
