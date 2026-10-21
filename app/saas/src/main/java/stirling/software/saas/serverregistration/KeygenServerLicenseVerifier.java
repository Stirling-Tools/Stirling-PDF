package stirling.software.saas.serverregistration;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.saas.procurement.config.KeygenConfigurationProperties;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Verifies proof and live validity without activating machines, renewing licenses or changing
 * capacity.
 */
@Service
@Profile("saas")
@ConditionalOnProperty(name = "stirling.server-registration.enabled", havingValue = "true")
public class KeygenServerLicenseVerifier {
    private static final String BEGIN = "-----BEGIN LICENSE FILE-----";
    private static final String END = "-----END LICENSE FILE-----";
    private final KeygenConfigurationProperties keygen;
    private final ServerRegistrationCloudProperties properties;
    private final ObjectMapper mapper;
    private final HttpClient http;
    private final Clock clock;

    @Autowired
    public KeygenServerLicenseVerifier(
            KeygenConfigurationProperties keygen,
            ServerRegistrationCloudProperties properties,
            ObjectMapper mapper) {
        this(
                keygen,
                properties,
                mapper,
                HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(10))
                        .followRedirects(HttpClient.Redirect.NEVER)
                        .build(),
                Clock.systemUTC());
    }

    KeygenServerLicenseVerifier(
            KeygenConfigurationProperties keygen,
            ServerRegistrationCloudProperties properties,
            ObjectMapper mapper,
            HttpClient http,
            Clock clock) {
        this.keygen = keygen;
        this.properties = properties;
        this.mapper = mapper;
        this.http = http;
        this.clock = clock;
        if (keygen.getAccountId() == null
                || keygen.getAccountId().isBlank()
                || keygen.getApiToken() == null
                || keygen.getApiToken().isBlank()
                || properties.getServerProductIds().isEmpty()) {
            throw new IllegalStateException(
                    "Server registration needs Keygen credentials and an explicit Server product allowlist");
        }
    }

    /**
     * Raw key is transient purchase-lookup material and must never be logged or copied into
     * registration storage.
     */
    public record VerifiedLicense(UUID id, String key, Integer userLimit) {
        @Override
        public String toString() {
            return "VerifiedLicense[id=" + id + ", key=REDACTED]";
        }
    }

    /**
     * A signed file proves possession; live validation is still mandatory for revocation and
     * expiry.
     */
    public VerifiedLicense verify(String proof, String fingerprint) {
        try {
            boolean certificate = proof.strip().startsWith(BEGIN);
            UUID certificateId = certificate ? certificateId(proof.strip()) : null;
            Map<String, Object> scope = Map.of("fingerprint", fingerprint);
            Map<String, Object> meta =
                    certificate ? Map.of("scope", scope) : Map.of("key", proof, "scope", scope);
            String endpoint =
                    certificate
                            ? "/licenses/" + certificateId + "/actions/validate"
                            : "/licenses/actions/validate-key";
            URI uri =
                    URI.create(
                            keygen.getApiBase().replaceAll("/+$", "")
                                    + "/accounts/"
                                    + URLEncoder.encode(
                                            keygen.getAccountId(), StandardCharsets.UTF_8)
                                    + endpoint);
            HttpRequest request =
                    HttpRequest.newBuilder(uri)
                            .timeout(Duration.ofSeconds(10))
                            .header("Authorization", "Bearer " + keygen.getApiToken())
                            .header("Content-Type", "application/vnd.api+json")
                            .header("Accept", "application/vnd.api+json")
                            .POST(
                                    HttpRequest.BodyPublishers.ofString(
                                            mapper.writeValueAsString(Map.of("meta", meta))))
                            .build();
            HttpResponse<String> response =
                    http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 429 || response.statusCode() >= 500) {
                throw unavailable();
            }
            if (response.statusCode() != 200) throw denied();
            JsonNode body = mapper.readTree(response.body());
            JsonNode valid = body.path("meta").path("valid");
            if (!valid.isBoolean() || !valid.asBoolean()) throw denied();
            JsonNode license = body.path("data");
            UUID id = UUID.fromString(license.path("id").asText());
            JsonNode attrs = license.path("attributes");
            JsonNode metadata = attrs.path("metadata");
            String product = license.at("/relationships/product/data/id").asText();
            String account = license.at("/relationships/account/data/id").asText();
            String key = attrs.path("key").asText("");
            if (!"licenses".equals(license.path("type").asText())
                    || !keygen.getAccountId().equals(account)
                    || !properties.getServerProductIds().contains(product)
                    || !metadata.path("isEnterprise").isBoolean()
                    || metadata.path("isEnterprise").asBoolean()
                    || (metadata.hasNonNull("plan_type")
                            && !"server".equals(metadata.path("plan_type").asText()))
                    || attrs.path("suspended").asBoolean(false)
                    || key.isBlank()
                    || (certificate && !id.equals(certificateId))
                    || (!certificate
                            && !MessageDigest.isEqual(
                                    key.getBytes(StandardCharsets.UTF_8),
                                    proof.getBytes(StandardCharsets.UTF_8)))) {
                throw denied();
            }
            JsonNode limit = metadata.path("users");
            Integer users = null;
            if (!limit.isMissingNode() && !limit.isNull()) {
                if (!limit.isIntegralNumber() || !limit.canConvertToInt() || limit.asInt() < 0)
                    throw denied();
                users = limit.asInt();
            }
            return new VerifiedLicense(id, key, users);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (IOException e) {
            throw unavailable();
        } catch (Exception e) {
            throw denied();
        }
    }

    private UUID certificateId(String proof) throws Exception {
        if (!proof.endsWith(END) || properties.getLicensePublicKey() == null) throw denied();
        String envelope =
                proof.substring(BEGIN.length(), proof.length() - END.length())
                        .replaceAll("\\s", "");
        JsonNode signed = mapper.readTree(Base64.getDecoder().decode(envelope));
        if (!"base64+ed25519".equals(signed.path("alg").asText())) throw denied();
        String encoded = signed.path("enc").asText();
        byte[] rawKey = HexFormat.of().parseHex(properties.getLicensePublicKey());
        if (rawKey.length != 32) throw denied();
        byte[] key = new byte[44];
        System.arraycopy(HexFormat.of().parseHex("302a300506032b6570032100"), 0, key, 0, 12);
        System.arraycopy(rawKey, 0, key, 12, 32);
        Signature signature = Signature.getInstance("Ed25519");
        signature.initVerify(
                KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(key)));
        signature.update(("license/" + encoded).getBytes(StandardCharsets.UTF_8));
        if (!signature.verify(Base64.getDecoder().decode(signed.path("sig").asText())))
            throw denied();
        JsonNode snapshot = mapper.readTree(Base64.getDecoder().decode(encoded));
        Instant issued = Instant.parse(snapshot.path("meta").path("issued").asText());
        Instant expires = Instant.parse(snapshot.path("meta").path("expiry").asText());
        if (issued.isAfter(clock.instant()) || !expires.isAfter(clock.instant())) throw denied();
        if (!"licenses".equals(snapshot.path("data").path("type").asText())) throw denied();
        return UUID.fromString(snapshot.path("data").path("id").asText());
    }

    private static ResponseStatusException denied() {
        return new ResponseStatusException(
                HttpStatus.UNAUTHORIZED, "Server license proof rejected");
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE, "License validation unavailable");
    }
}
