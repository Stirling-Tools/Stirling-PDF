package stirling.software.proprietary.accountlink;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.billing.UnitCalcPolicy;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Outbound calls from a self-hosted instance to its linked SaaS backend (combined-billing "Mode
 * A").
 *
 * <p>Calls:
 *
 * <ul>
 *   <li>{@link #connectRequest} / {@link #connectClaim} — the browser-mediated link handshake. The
 *       admin's Supabase JWT never passes through here: it goes to their own browser, and this side
 *       collects only a device credential, authenticated by a claim secret.
 *   <li>{@link #fetchEntitlement} — authenticates with the stored device credential against {@code
 *       GET /api/v1/instance/entitlement}; what the local gate consults.
 *   <li>{@link #reportUsage} — daily usage sync ({@code POST /api/v1/instance/sync}); reports
 *       cumulative units and returns the refreshed entitlement.
 *   <li>{@link #revokeSelf} — self-revokes the credential on local unlink ({@code POST
 *       /api/v1/instance/revoke-self}).
 * </ul>
 *
 * <p>Uses {@code java.net.http.HttpClient} (the established self-hosted outbound pattern; see
 * {@code AiEngineClient}); base URL + client are injectable so tests can stub SaaS.
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
     * Authoritative deny (401/403) — the device credential is revoked or invalid. Unlike a
     * transport/server failure (which returns {@code null} and fails open), the cache must BLOCK on
     * this. Unchecked so it propagates through {@link #fetchEntitlement}'s transport try/catch.
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
     * What the SaaS side hands back when it records a connect handshake.
     *
     * <p>{@code authorizeUrl} comes from SaaS rather than being composed here: it is the only party
     * that knows where its own approval page lives, so an instance that had to configure that could
     * only get it wrong and would need reconfiguring whenever the page moved.
     */
    public record ConnectRequestResult(
            String requestId, int expiresInSeconds, String authorizeUrl) {}

    public enum ConnectClaimOutcome {
        /** Approved and collected; the credential fields are populated. */
        GRANTED,
        /**
         * A re-authentication was approved. No credential comes back: we already hold one, and a
         * second would orphan it. Only the browser leg needed confirming.
         */
        CONFIRMED,
        /** No human decision yet. Keep waiting. */
        PENDING,
        /** Declined, expired or already used. Terminal — do not retry. */
        REJECTED,
        /** SaaS unreachable or erroring. Transient, so the caller may retry. */
        UNAVAILABLE
    }

    public record ConnectClaimResult(
            ConnectClaimOutcome outcome, String deviceId, String deviceSecret, Long teamId) {
        static ConnectClaimResult of(ConnectClaimOutcome outcome) {
            return new ConnectClaimResult(outcome, null, null, null);
        }
    }

    /**
     * Opens a connect handshake. Unauthenticated by nature — this is the call made before this
     * instance holds any credential at all.
     *
     * @throws IOException on transport failure or a non-2xx reply.
     */
    public ConnectRequestResult connectRequest(
            String name, String callbackUrl, String nonce, String claimSecret) throws IOException {
        return connectRequest(name, callbackUrl, nonce, claimSecret, null);
    }

    /**
     * As {@link #connectRequest}, but presenting an existing device credential so the SaaS side
     * treats this as a re-authentication and pins the handshake to the team we already belong to.
     *
     * <p>Sending the credential is what makes the pinning trustworthy: the team comes from
     * something only this instance holds, rather than from anything a browser could assert.
     */
    public ConnectRequestResult connectRequest(
            String name,
            String callbackUrl,
            String nonce,
            String claimSecret,
            DeviceCredential credential)
            throws IOException {
        ObjectNode root = mapper.createObjectNode();
        if (name != null && !name.isBlank()) {
            root.put("name", name);
        }
        root.put("callbackUrl", callbackUrl);
        root.put("nonce", nonce);
        root.put("claimSecret", claimSecret);

        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(uri("/api/v1/account-link/connect/request"))
                        .header("Content-Type", "application/json")
                        .header("Accept", "application/json")
                        .timeout(timeout())
                        .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(root)));
        if (credential != null) {
            builder.header(HEADER_DEVICE_ID, credential.getDeviceId())
                    .header(HEADER_DEVICE_SECRET, credential.getDeviceSecret());
        }

        HttpResponse<String> response = send(builder.build());
        if (response.statusCode() / 100 != 2) {
            throw new UpstreamException(response.statusCode(), response.body());
        }
        JsonNode body = mapper.readTree(response.body());
        String requestId = text(body, "requestId");
        if (requestId == null) {
            throw new IOException("SaaS connect response missing requestId");
        }
        // We navigate an admin's browser here, so refuse anything that is not a plain absolute
        // http(s) URL. This is the SaaS host we already trust for entitlement decisions, but a
        // malformed or scheme-shifted value should fail loudly rather than reach the browser.
        String authorizeUrl = text(body, "authorizeUrl");
        if (authorizeUrl == null || !isAbsoluteHttpUrl(authorizeUrl)) {
            throw new IOException("SaaS connect response carried no usable authorizeUrl");
        }
        return new ConnectRequestResult(requestId, body.path("expiresIn").asInt(0), authorizeUrl);
    }

    /**
     * Collects the device credential for an approved handshake, proving possession of the claim
     * secret. Never throws: the outcome enum carries the distinction the caller needs between
     * "wait", "give up" and "try again later".
     */
    public ConnectClaimResult connectClaim(String requestId, String claimSecret) {
        HttpResponse<String> response;
        try {
            ObjectNode root = mapper.createObjectNode();
            root.put("requestId", requestId);
            root.put("claimSecret", claimSecret);
            HttpRequest request =
                    HttpRequest.newBuilder()
                            .uri(uri("/api/v1/account-link/connect/claim"))
                            .header("Content-Type", "application/json")
                            .header("Accept", "application/json")
                            .timeout(timeout())
                            .POST(
                                    HttpRequest.BodyPublishers.ofString(
                                            mapper.writeValueAsString(root)))
                            .build();
            response = send(request);
        } catch (Exception e) {
            log.debug("Connect claim failed (transport): {}", e.getMessage());
            return ConnectClaimResult.of(ConnectClaimOutcome.UNAVAILABLE);
        }
        int status = response.statusCode();
        if (status == 202) {
            return ConnectClaimResult.of(ConnectClaimOutcome.PENDING);
        }
        if (status / 100 == 5) {
            return ConnectClaimResult.of(ConnectClaimOutcome.UNAVAILABLE);
        }
        if (status / 100 != 2) {
            return ConnectClaimResult.of(ConnectClaimOutcome.REJECTED);
        }
        try {
            JsonNode body = mapper.readTree(response.body());
            Long teamId = body.hasNonNull("teamId") ? body.get("teamId").asLong() : null;
            // A re-authentication says so explicitly and carries no credential, so an absent
            // credential is only an error when we were expecting one.
            if ("confirmed".equals(text(body, "status"))) {
                return new ConnectClaimResult(ConnectClaimOutcome.CONFIRMED, null, null, teamId);
            }
            String deviceId = text(body, "deviceId");
            String deviceSecret = text(body, "deviceSecret");
            if (deviceId == null || deviceSecret == null) {
                log.warn("Connect claim succeeded but the reply carried no credential");
                return ConnectClaimResult.of(ConnectClaimOutcome.REJECTED);
            }
            return new ConnectClaimResult(
                    ConnectClaimOutcome.GRANTED, deviceId, deviceSecret, teamId);
        } catch (RuntimeException e) {
            log.debug("Connect claim parse failed: {}", e.getMessage());
            return ConnectClaimResult.of(ConnectClaimOutcome.REJECTED);
        }
    }

    /**
     * Revokes this instance's own credential on the SaaS side, authenticated by that credential.
     * Best-effort: returns {@code false} if SaaS is unreachable or rejects, so the caller (local
     * unlink) can still clear locally and log the orphan for follow-up. Idempotent on SaaS.
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

    /**
     * Reports the period's cumulative per-category units to {@code POST /api/v1/instance/sync} and
     * returns the fresh entitlement in the same reply — one round-trip both reports and refreshes.
     * SaaS bills the delta against its last-seen cumulative, so resending the same totals is
     * idempotent. Same three outcomes as {@link #fetchEntitlement}; on {@code null} the caller must
     * not advance its last-synced markers so the usage retries next sync.
     */
    public InstanceEntitlement reportUsage(
            String deviceId,
            String deviceSecret,
            long syncSeq,
            LocalDateTime periodStart,
            long apiUnits,
            long aiUnits,
            long automationUnits) {
        HttpResponse<String> response;
        try {
            ObjectNode root = mapper.createObjectNode();
            root.put("syncSeq", syncSeq);
            // Explicit ISO-8601 string so it round-trips regardless of the mapper's time config.
            root.put("periodStart", periodStart.toString());
            ObjectNode units = root.putObject("cumulativeUnits");
            units.put("api", apiUnits);
            units.put("ai", aiUnits);
            units.put("automation", automationUnits);
            String body = mapper.writeValueAsString(root);
            HttpRequest request =
                    HttpRequest.newBuilder()
                            .uri(uri("/api/v1/instance/sync"))
                            .header(HEADER_DEVICE_ID, deviceId)
                            .header(HEADER_DEVICE_SECRET, deviceSecret)
                            .header("Content-Type", "application/json")
                            .header("Accept", "application/json")
                            .timeout(timeout())
                            .POST(HttpRequest.BodyPublishers.ofString(body))
                            .build();
            response = send(request);
        } catch (Exception e) {
            log.debug("Usage sync failed: {}", e.getMessage());
            return null;
        }
        int status = response.statusCode();
        if (status == 401 || status == 403) {
            throw new RevokedException(status);
        }
        if (status / 100 != 2) {
            log.debug("Usage sync returned HTTP {}", status);
            return null;
        }
        try {
            return parseEntitlement(response.body());
        } catch (IOException e) {
            log.debug("Usage sync parse failed: {}", e.getMessage());
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
        return new InstanceEntitlement(
                subscribed,
                freeRemaining,
                periodSpend,
                periodCap,
                state,
                parseUnitCalcPolicy(root),
                parseDateTime(root, "periodStart"),
                parseDateTime(root, "periodEnd"));
    }

    /** Parses the nested unit-calc policy; null if absent or any knob is invalid (e.g. zero). */
    private static UnitCalcPolicy parseUnitCalcPolicy(JsonNode root) {
        if (!root.hasNonNull("unitCalcPolicy")) {
            return null;
        }
        JsonNode node = root.get("unitCalcPolicy");
        try {
            return new UnitCalcPolicy(
                    node.path("docPagesPerUnit").asInt(),
                    node.path("docBytesPerUnit").asLong(),
                    node.path("minChargeUnits").asInt(),
                    node.path("fileUnitCap").asInt());
        } catch (RuntimeException e) {
            // Malformed policy → degrade to "none" rather than fail the whole entitlement parse.
            return null;
        }
    }

    /** ISO date-time field → LocalDateTime; null if absent or unparseable. */
    private static LocalDateTime parseDateTime(JsonNode root, String field) {
        if (!root.hasNonNull(field)) {
            return null;
        }
        try {
            return LocalDateTime.parse(root.get(field).asText(null));
        } catch (RuntimeException e) {
            return null;
        }
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

    /** Absolute http(s) with a host. Rejects relative paths and other schemes. */
    static boolean isAbsoluteHttpUrl(String candidate) {
        try {
            URI uri = URI.create(candidate.strip());
            String scheme = uri.getScheme();
            return uri.isAbsolute()
                    && scheme != null
                    && ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                    && uri.getHost() != null
                    && !uri.getHost().isBlank();
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
