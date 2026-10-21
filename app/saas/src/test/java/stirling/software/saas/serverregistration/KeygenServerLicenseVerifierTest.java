package stirling.software.saas.serverregistration;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.saas.procurement.config.KeygenConfigurationProperties;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class KeygenServerLicenseVerifierTest {
    private static final UUID ACCOUNT = UUID.randomUUID();
    private static final UUID PRODUCT = UUID.randomUUID();
    private static final UUID LICENSE = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-10-16T12:00:00Z");
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = mock(HttpClient.class);
    private KeyPair signingKey;
    private KeygenServerLicenseVerifier verifier;

    @BeforeEach
    void setup() throws Exception {
        signingKey = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        var keygen = new KeygenConfigurationProperties();
        keygen.setAccountId(ACCOUNT.toString());
        keygen.setApiToken("test-token");
        var properties = new ServerRegistrationCloudProperties();
        properties.setServerProductIds(Set.of(PRODUCT.toString()));
        byte[] encoded = signingKey.getPublic().getEncoded();
        properties.setLicensePublicKey(
                HexFormat.of()
                        .formatHex(
                                Arrays.copyOfRange(encoded, encoded.length - 32, encoded.length)));
        verifier =
                new KeygenServerLicenseVerifier(
                        keygen, properties, mapper, http, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void rawKeyNeedsLiveValidationAndRetainsUnlimitedSentinel() throws Exception {
        respond(200, liveBody());
        var result = verifier.verify("test-license-secret", "machine");
        assertThat(result.id()).isEqualTo(LICENSE);
        assertThat(result.userLimit()).isZero();
        assertThat(result.toString()).doesNotContain("test-license-secret");
        var request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any());
        assertThat(request.getValue().uri().getPath()).endsWith("/licenses/actions/validate-key");
    }

    @Test
    void signedFileStillRequiresLiveValidationOfTheSameLicense() throws Exception {
        respond(200, liveBody());
        assertThat(
                        verifier.verify(
                                        certificate(
                                                NOW.minusSeconds(1),
                                                NOW.plusSeconds(60),
                                                signingKey),
                                        "machine")
                                .id())
                .isEqualTo(LICENSE);
        var request = ArgumentCaptor.forClass(HttpRequest.class);
        verify(http).send(request.capture(), any());
        assertThat(request.getValue().uri().getPath())
                .endsWith("/licenses/" + LICENSE + "/actions/validate");
    }

    @Test
    void forgedExpiredOrFutureCertificatesNeverReachKeygen() throws Exception {
        String forged =
                certificate(
                        NOW.minusSeconds(1),
                        NOW.plusSeconds(60),
                        KeyPairGenerator.getInstance("Ed25519").generateKeyPair());
        String expired = certificate(NOW.minusSeconds(60), NOW, signingKey);
        String future = certificate(NOW.plusSeconds(1), NOW.plusSeconds(60), signingKey);
        for (String proof : new String[] {forged, expired, future}) {
            assertThatThrownBy(() -> verifier.verify(proof, "machine"))
                    .isInstanceOfSatisfying(
                            ResponseStatusException.class,
                            e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
        }
        verifyNoInteractions(http);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "invalid",
                "untypedValidity",
                "wrongPlan",
                "wrongProduct",
                "wrongAccount",
                "enterprise",
                "missingTier",
                "suspended",
                "negativeUsers",
                "changedKey"
            })
    void activeStatusAloneCannotAuthorizeRegistration(String problem) throws Exception {
        ObjectNode body = liveBody();
        ObjectNode attributes = (ObjectNode) body.at("/data/attributes");
        ObjectNode metadata = (ObjectNode) attributes.path("metadata");
        switch (problem) {
            case "invalid" -> ((ObjectNode) body.path("meta")).put("valid", false);
            case "untypedValidity" -> ((ObjectNode) body.path("meta")).put("valid", "true");
            case "wrongPlan" -> metadata.put("plan_type", "enterprise");
            case "wrongProduct" ->
                    ((ObjectNode) body.at("/data/relationships/product/data"))
                            .put("id", UUID.randomUUID().toString());
            case "wrongAccount" ->
                    ((ObjectNode) body.at("/data/relationships/account/data"))
                            .put("id", UUID.randomUUID().toString());
            case "enterprise" -> metadata.put("isEnterprise", true);
            case "missingTier" -> metadata.remove("isEnterprise");
            case "suspended" -> attributes.put("suspended", true);
            case "negativeUsers" -> metadata.put("users", -1);
            case "changedKey" -> attributes.put("key", "different-key");
            default -> throw new AssertionError(problem);
        }
        respond(200, body);
        assertThatThrownBy(() -> verifier.verify("test-license-secret", "machine"))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED))
                .hasMessageNotContaining("test-license-secret");
    }

    @Test
    void mismatchedSignedLicenseIdIsRejected() throws Exception {
        ObjectNode body = liveBody();
        ((ObjectNode) body.path("data")).put("id", UUID.randomUUID().toString());
        respond(200, body);
        String proof = certificate(NOW.minusSeconds(1), NOW.plusSeconds(60), signingKey);
        assertThatThrownBy(() -> verifier.verify(proof, "machine"))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @ParameterizedTest
    @ValueSource(ints = {429, 500, 503})
    void upstreamOutageFailsClosedWithoutAnEntitlementDecision(int status) throws Exception {
        respond(status, liveBody());
        assertThatThrownBy(() -> verifier.verify("test-license-secret", "machine"))
                .isInstanceOfSatisfying(
                        ResponseStatusException.class,
                        e ->
                                assertThat(e.getStatusCode())
                                        .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    private ObjectNode liveBody() {
        return (ObjectNode)
                mapper.valueToTree(
                        Map.of(
                                "meta",
                                Map.of("valid", true),
                                "data",
                                Map.of(
                                        "id",
                                        LICENSE,
                                        "type",
                                        "licenses",
                                        "attributes",
                                        Map.of(
                                                "key",
                                                "test-license-secret",
                                                "status",
                                                "ACTIVE",
                                                "suspended",
                                                false,
                                                "metadata",
                                                Map.of("isEnterprise", false, "users", 0)),
                                        "relationships",
                                        Map.of(
                                                "account",
                                                Map.of("data", Map.of("id", ACCOUNT)),
                                                "product",
                                                Map.of("data", Map.of("id", PRODUCT))))));
    }

    @SuppressWarnings("unchecked")
    private void respond(int status, ObjectNode body) throws Exception {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.body()).thenReturn(mapper.writeValueAsString(body));
        when(http.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);
    }

    private String certificate(Instant issued, Instant expiry, KeyPair key) throws Exception {
        byte[] snapshot =
                mapper.writeValueAsBytes(
                        Map.of(
                                "meta",
                                Map.of("issued", issued.toString(), "expiry", expiry.toString()),
                                "data",
                                Map.of("type", "licenses", "id", LICENSE)));
        String enc = Base64.getEncoder().encodeToString(snapshot);
        Signature signature = Signature.getInstance("Ed25519");
        signature.initSign(key.getPrivate());
        signature.update(("license/" + enc).getBytes(StandardCharsets.UTF_8));
        String envelope =
                Base64.getEncoder()
                        .encodeToString(
                                mapper.writeValueAsBytes(
                                        Map.of(
                                                "alg",
                                                "base64+ed25519",
                                                "enc",
                                                enc,
                                                "sig",
                                                Base64.getEncoder()
                                                        .encodeToString(signature.sign()))));
        return "-----BEGIN LICENSE FILE-----\n" + envelope + "\n-----END LICENSE FILE-----";
    }
}
