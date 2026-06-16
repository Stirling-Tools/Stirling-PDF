package stirling.software.proprietary.security.configuration.ee;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;

import tools.jackson.databind.ObjectMapper;

/**
 * Unit tests for {@link KeygenLicenseVerifier}.
 *
 * <p>Strategy: drive the single public method {@code verifyLicense(String)} with real, in-memory
 * collaborators (a real Jackson {@link ObjectMapper} and a real {@link ApplicationProperties}). No
 * Spring context, no network, no clock waiting.
 *
 * <p>The certificate / JWT verification paths perform Ed25519 signature checks against a hard-coded
 * public key whose matching private key is a secret we do not possess. We therefore cannot forge a
 * signature that verifies, so those inputs resolve to {@link License#NORMAL}. We exercise all of
 * the reachable branches: premium gating, format detection / routing, malformed payloads, the
 * unsupported-algorithm branch, and signature rejection. The "standard" (HTTP API) path is
 * deliberately NOT triggered because it performs a real keygen.sh call and a multi-second retry/
 * sleep loop.
 */
class KeygenLicenseVerifierTest {

    private static final String CERT_PREFIX = "-----BEGIN LICENSE FILE-----";
    private static final String CERT_SUFFIX = "-----END LICENSE FILE-----";

    private ObjectMapper objectMapper;
    private ApplicationProperties applicationProperties;
    private KeygenLicenseVerifier verifier;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        applicationProperties = new ApplicationProperties();
        verifier = new KeygenLicenseVerifier(objectMapper, applicationProperties);
    }

    private void enablePremium() {
        applicationProperties.getPremium().setEnabled(true);
    }

    /** Wraps a JSON cert-file body into the PEM-style envelope the verifier expects. */
    private static String certFile(String innerJson) {
        String b64 = Base64.getEncoder().encodeToString(innerJson.getBytes(StandardCharsets.UTF_8));
        return CERT_PREFIX + "\n" + b64 + "\n" + CERT_SUFFIX;
    }

    @Nested
    @DisplayName("Premium gating")
    class PremiumGating {

        @Test
        @DisplayName("returns NORMAL immediately when premium is disabled (default)")
        void premiumDisabled_returnsNormal() {
            // premium defaults to disabled; any input must short-circuit to NORMAL
            assertEquals(License.NORMAL, verifier.verifyLicense("anything-at-all"));
        }

        @Test
        @DisplayName(
                "does not parse / touch input when premium disabled, even for a cert-shaped key")
        void premiumDisabled_certShapedInput_returnsNormal() {
            String cert = certFile("{\"alg\":\"base64+ed25519\",\"enc\":\"x\",\"sig\":\"y\"}");
            assertEquals(License.NORMAL, verifier.verifyLicense(cert));
        }

        @Test
        @DisplayName("does not touch input when premium disabled, even for a JWT-shaped key")
        void premiumDisabled_jwtShapedInput_returnsNormal() {
            assertEquals(License.NORMAL, verifier.verifyLicense("key/payload.signature"));
        }

        @Test
        @DisplayName("premium disabled tolerates null without throwing")
        void premiumDisabled_null_returnsNormal() {
            assertEquals(License.NORMAL, verifier.verifyLicense(null));
        }
    }

    @Nested
    @DisplayName("Certificate-based license routing")
    class CertificateLicense {

        @Test
        @DisplayName("unsupported algorithm is rejected -> NORMAL")
        void unsupportedAlgorithm_returnsNormal() {
            enablePremium();
            // Valid JSON envelope, but alg is not base64+ed25519, so it is rejected before
            // signature.
            String cert =
                    certFile("{\"enc\":\"ZGF0YQ==\",\"sig\":\"c2ln\",\"alg\":\"base64+rsa\"}");
            assertEquals(License.NORMAL, verifier.verifyLicense(cert));
        }

        @Test
        @DisplayName("missing algorithm field is rejected -> NORMAL")
        void missingAlgorithm_returnsNormal() {
            enablePremium();
            String cert = certFile("{\"enc\":\"ZGF0YQ==\",\"sig\":\"c2ln\"}");
            assertEquals(License.NORMAL, verifier.verifyLicense(cert));
        }

        @Test
        @DisplayName("correct algorithm but unforgeable signature is rejected -> NORMAL")
        void correctAlgorithmInvalidSignature_returnsNormal() {
            enablePremium();
            // alg accepted, but sig cannot validate against the real public key.
            String cert =
                    certFile("{\"enc\":\"ZGF0YQ==\",\"sig\":\"AAAA\",\"alg\":\"base64+ed25519\"}");
            assertEquals(License.NORMAL, verifier.verifyLicense(cert));
        }

        @Test
        @DisplayName("non-base64 inner payload is handled -> NORMAL")
        void nonBase64InnerPayload_returnsNormal() {
            enablePremium();
            // The raw cert body (between header/footer) is not valid base64.
            String cert = CERT_PREFIX + "\n!!!not-base64!!!\n" + CERT_SUFFIX;
            assertEquals(License.NORMAL, verifier.verifyLicense(cert));
        }

        @Test
        @DisplayName("decoded payload that is not JSON is handled -> NORMAL")
        void decodedPayloadNotJson_returnsNormal() {
            enablePremium();
            String cert = certFile("this is plainly not json {");
            assertEquals(License.NORMAL, verifier.verifyLicense(cert));
        }

        @Test
        @DisplayName("empty JSON object (no alg) is rejected -> NORMAL")
        void emptyJsonObject_returnsNormal() {
            enablePremium();
            String cert = certFile("{}");
            assertEquals(License.NORMAL, verifier.verifyLicense(cert));
        }

        @Test
        @DisplayName("leading/trailing whitespace still detected as certificate -> NORMAL")
        void whitespaceWrappedCert_stillRoutedAsCert() {
            enablePremium();
            String cert =
                    "   \n"
                            + certFile(
                                    "{\"enc\":\"ZGF0YQ==\",\"sig\":\"AAAA\",\"alg\":\"base64+ed25519\"}")
                            + "\n   ";
            // Routed through the cert path (trim().startsWith(CERT_PREFIX)); sig fails -> NORMAL.
            assertEquals(License.NORMAL, verifier.verifyLicense(cert));
        }
    }

    @Nested
    @DisplayName("JWT-style (key/) license routing")
    class JwtLicense {

        @Test
        @DisplayName("missing dot separator -> invalid format -> NORMAL")
        void noSeparator_returnsNormal() {
            enablePremium();
            assertEquals(License.NORMAL, verifier.verifyLicense("key/onlypayloadnodot"));
        }

        @Test
        @DisplayName("payload.signature with unforgeable signature -> NORMAL")
        void wellFormedButInvalidSignature_returnsNormal() {
            enablePremium();
            String payload =
                    Base64.getUrlEncoder()
                            .withoutPadding()
                            .encodeToString(
                                    "{\"license\":{\"id\":\"x\"}}"
                                            .getBytes(StandardCharsets.UTF_8));
            String sig = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[64]);
            assertEquals(License.NORMAL, verifier.verifyLicense("key/" + payload + "." + sig));
        }

        @Test
        @DisplayName("empty payload and empty signature after prefix -> NORMAL")
        void emptyPayloadAndSignature_returnsNormal() {
            enablePremium();
            // "key/." splits into ["", ""] -> length 2, signature verification then fails.
            assertEquals(License.NORMAL, verifier.verifyLicense("key/."));
        }

        @Test
        @DisplayName("just the prefix 'key/' (no payload, no dot) -> invalid format -> NORMAL")
        void onlyPrefix_returnsNormal() {
            enablePremium();
            assertEquals(License.NORMAL, verifier.verifyLicense("key/"));
        }

        @Test
        @DisplayName("garbage (non-base64) signature is caught -> NORMAL")
        void garbageSignature_returnsNormal() {
            enablePremium();
            String payload =
                    Base64.getUrlEncoder()
                            .withoutPadding()
                            .encodeToString("{\"id\":\"abc\"}".getBytes(StandardCharsets.UTF_8));
            assertEquals(
                    License.NORMAL, verifier.verifyLicense("key/" + payload + ".***not-base64***"));
        }
    }

    @Nested
    @DisplayName("Format detection precedence")
    class FormatDetection {

        @Test
        @DisplayName("'key/' prefixed inside a cert envelope still routes as certificate")
        void certPrefixWins() {
            enablePremium();
            // Starts with CERT_PREFIX, so cert detection runs first regardless of content.
            String cert = certFile("{\"alg\":\"none\"}");
            assertEquals(License.NORMAL, verifier.verifyLicense(cert));
        }

        @Test
        @DisplayName(
                "blank string is not cert/JWT; would hit standard path but premium gates it off")
        void blankString_withPremiumDisabled_returnsNormal() {
            // Premium left disabled so we never reach the network standard path.
            assertEquals(License.NORMAL, verifier.verifyLicense("   "));
        }
    }

    @Nested
    @DisplayName("Side effects on ApplicationProperties")
    class SideEffects {

        @Test
        @DisplayName("rejected certificate license does not mutate maxUsers")
        void rejectedCert_doesNotSetMaxUsers() {
            enablePremium();
            applicationProperties.getPremium().setMaxUsers(42);
            String cert =
                    certFile("{\"enc\":\"ZGF0YQ==\",\"sig\":\"AAAA\",\"alg\":\"base64+ed25519\"}");

            verifier.verifyLicense(cert);

            // Signature failed before any metadata processing, so maxUsers is untouched.
            assertEquals(42, applicationProperties.getPremium().getMaxUsers());
        }

        @Test
        @DisplayName("premium-disabled path leaves maxUsers untouched")
        void premiumDisabled_doesNotSetMaxUsers() {
            applicationProperties.getPremium().setMaxUsers(7);

            verifier.verifyLicense("anything");

            assertEquals(7, applicationProperties.getPremium().getMaxUsers());
        }
    }

    @Nested
    @DisplayName("License enum contract")
    class LicenseEnum {

        @Test
        @DisplayName("declares NORMAL, SERVER and ENTERPRISE")
        void enumValues() {
            License[] values = License.values();
            assertEquals(3, values.length);
            assertSame(License.NORMAL, License.valueOf("NORMAL"));
            assertSame(License.SERVER, License.valueOf("SERVER"));
            assertSame(License.ENTERPRISE, License.valueOf("ENTERPRISE"));
        }

        @Test
        @DisplayName("verifier is constructible with its two collaborators")
        void constructible() {
            KeygenLicenseVerifier v =
                    new KeygenLicenseVerifier(new ObjectMapper(), new ApplicationProperties());
            assertNotNull(v);
        }
    }
}
