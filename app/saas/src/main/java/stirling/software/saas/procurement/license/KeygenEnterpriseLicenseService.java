package stirling.software.saas.procurement.license;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.procurement.config.KeygenConfigurationProperties;

/**
 * Real {@link EnterpriseLicenseService}: manages the team's enterprise licence directly against the
 * Keygen API (the "call Keygen from Java" direction), rather than via the Supabase edge functions
 * the self-hosted checkout uses. Active only when {@code stirling.keygen.enabled=true}; otherwise
 * {@link MockEnterpriseLicenseService} is the bean.
 *
 * <p>Licences are owned by the team leader (a Keygen user, found or created by email) and created
 * under the committed-enterprise policy. Metadata carries {@code isEnterprise} + {@code users} so a
 * checked-out offline licence file satisfies the self-hosted {@code KeygenLicenseVerifier}. The
 * licence key returned is stored on the deal as its {@code license_ref}.
 */
@Slf4j
@Service
@Profile("saas")
@ConditionalOnProperty(name = "stirling.keygen.enabled", havingValue = "true")
public class KeygenEnterpriseLicenseService implements EnterpriseLicenseService {

    private static final String VND_JSON = "application/vnd.api+json";

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http =
            HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final KeygenConfigurationProperties config;

    public KeygenEnterpriseLicenseService(KeygenConfigurationProperties config) {
        this.config = config;
        if (!config.isConfigured()) {
            log.warn(
                    "[procurement][keygen] enabled but not fully configured "
                            + "(need STIRLING_KEYGEN_ACCOUNT_ID / _API_TOKEN / _POLICY_ID) — calls will fail");
        }
    }

    @Override
    public String issueTrialLicense(Long teamId, String ownerEmail, LocalDateTime expiresAt) {
        String ownerId = findOrCreateUser(ownerEmail);
        // Trial: enterprise entitlement, unlimited users, expiring at the trial end.
        return createLicense(ownerId, expiresAt, metadata(teamId, null, 0, true));
    }

    @Override
    public void extendLicense(String licenseRef, LocalDateTime newExpiry) {
        Map<String, Object> attrs = new LinkedHashMap<>();
        attrs.put("expiry", iso(newExpiry));
        patchLicense(licenseRef, attrs);
    }

    @Override
    public String issueAnnualLicense(
            Long teamId,
            String ownerEmail,
            String deployment,
            int seats,
            LocalDateTime expiresAt,
            String existingRef) {
        // Upgrade the trial licence in place so the key the buyer already holds keeps working.
        if (existingRef != null && !existingRef.isBlank()) {
            Map<String, Object> attrs = new LinkedHashMap<>();
            attrs.put("expiry", iso(expiresAt));
            attrs.put("suspended", false);
            attrs.put("metadata", metadata(teamId, deployment, seats, false));
            patchLicense(existingRef, attrs);
            return existingRef;
        }
        String ownerId = findOrCreateUser(ownerEmail);
        return createLicense(ownerId, expiresAt, metadata(teamId, deployment, seats, false));
    }

    @Override
    public void suspendLicense(String licenseRef) {
        HttpResponse<String> res =
                send(
                        authed(licenseUrl(licenseRef) + "/actions/suspend")
                                .POST(HttpRequest.BodyPublishers.noBody())
                                .build());
        expect(res, 200, "suspend licence");
    }

    @Override
    public String checkOutLicenseFile(String licenseRef) {
        // Signed, unencrypted (base64+ed25519) so the self-hosted verifier can validate it offline;
        // include entitlements in the snapshot. Never encrypt — the verifier only reads
        // base64+ed25519.
        String url =
                licenseUrl(licenseRef)
                        + "/actions/check-out?include=entitlements&algorithm="
                        + enc(config.getLicenseFileAlgorithm());
        HttpResponse<String> res =
                send(authed(url).POST(HttpRequest.BodyPublishers.noBody()).build());
        expect(res, 200, "check-out licence file");
        JsonNode cert = readJson(res).at("/data/attributes/certificate");
        if (cert.isMissingNode() || cert.asText().isBlank()) {
            throw new IllegalStateException("Keygen check-out returned no certificate");
        }
        return cert.asText();
    }

    // ---- Keygen primitives --------------------------------------------------

    /** Find the Keygen user by email, creating it if absent; returns the user id. */
    private String findOrCreateUser(String email) {
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Cannot own a licence without an owner email");
        }
        HttpResponse<String> find =
                send(authed(accountUrl() + "/users/" + enc(email)).GET().build());
        if (find.statusCode() == 200) {
            return readJson(find).at("/data/id").asText();
        }
        if (find.statusCode() != 404) {
            expect(find, 200, "find Keygen user"); // throws with the real status
        }
        Map<String, Object> body =
                jsonApi("users", Map.of("email", email), null); // no relationships
        HttpResponse<String> create =
                send(
                        authed(accountUrl() + "/users")
                                .POST(HttpRequest.BodyPublishers.ofString(write(body)))
                                .build());
        expect(create, 201, "create Keygen user");
        return readJson(create).at("/data/id").asText();
    }

    private String createLicense(
            String ownerId, LocalDateTime expiresAt, Map<String, Object> metadata) {
        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("expiry", iso(expiresAt));
        attributes.put("metadata", metadata);
        Map<String, Object> relationships =
                Map.of(
                        "policy",
                        Map.of("data", Map.of("type", "policies", "id", config.getPolicyId())),
                        "owner",
                        Map.of("data", Map.of("type", "users", "id", ownerId)));
        Map<String, Object> body = jsonApi("licenses", attributes, relationships);
        HttpResponse<String> res =
                send(
                        authed(accountUrl() + "/licenses")
                                .POST(HttpRequest.BodyPublishers.ofString(write(body)))
                                .build());
        expect(res, 201, "create licence");
        return readJson(res).at("/data/attributes/key").asText();
    }

    private void patchLicense(String licenseRef, Map<String, Object> attributes) {
        Map<String, Object> body = jsonApi("licenses", attributes, null);
        HttpResponse<String> res =
                send(
                        authed(licenseUrl(licenseRef))
                                .method("PATCH", HttpRequest.BodyPublishers.ofString(write(body)))
                                .build());
        expect(res, 200, "update licence");
    }

    // ---- helpers ------------------------------------------------------------

    /**
     * Metadata the self-hosted verifier reads: {@code isEnterprise} + {@code users} (0 =
     * unlimited).
     */
    private Map<String, Object> metadata(Long teamId, String deployment, int seats, boolean trial) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("team_id", teamId);
        m.put("plan_type", "enterprise");
        m.put("isEnterprise", true);
        m.put("users", Math.max(0, seats));
        m.put("trial", trial);
        if (deployment != null && !deployment.isBlank()) m.put("deployment", deployment);
        return m;
    }

    private Map<String, Object> jsonApi(
            String type, Map<String, Object> attributes, Map<String, Object> relationships) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("type", type);
        data.put("attributes", attributes);
        if (relationships != null) data.put("relationships", relationships);
        return Map.of("data", data);
    }

    private HttpRequest.Builder authed(String url) {
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + config.getApiToken())
                .header("Content-Type", VND_JSON)
                .header("Accept", VND_JSON)
                .timeout(Duration.ofSeconds(30));
    }

    private HttpResponse<String> send(HttpRequest request) {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (java.io.IOException e) {
            throw new IllegalStateException("Keygen request failed: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Keygen request interrupted", e);
        }
    }

    private void expect(HttpResponse<String> res, int status, String action) {
        if (res.statusCode() != status) {
            // Body can echo the request but never the token; safe to log for diagnostics.
            throw new IllegalStateException(
                    "Keygen " + action + " failed: HTTP " + res.statusCode() + " " + res.body());
        }
    }

    private JsonNode readJson(HttpResponse<String> res) {
        try {
            return mapper.readTree(res.body());
        } catch (Exception e) {
            throw new IllegalStateException("Keygen returned unparseable JSON", e);
        }
    }

    private String write(Map<String, Object> body) {
        try {
            return mapper.writeValueAsString(body);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialise Keygen request", e);
        }
    }

    private String accountUrl() {
        return config.getApiBase() + "/accounts/" + config.getAccountId();
    }

    private String licenseUrl(String licenseRef) {
        return accountUrl() + "/licenses/" + enc(licenseRef);
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private static String iso(LocalDateTime dt) {
        return dt.toInstant(ZoneOffset.UTC).toString();
    }
}
