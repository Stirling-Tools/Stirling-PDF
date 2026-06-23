package stirling.software.proprietary.security.configuration.ee;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.time.Instant;
import java.util.Base64;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Unit tests for {@link KeygenLicenseVerifier}. Standard (online) license paths are NOT exercised
 * because they make real HTTP calls to api.keygen.sh through a static HttpClient; only the offline
 * certificate/JWT crypto + parsing branches and the private processing helpers are covered.
 */
class KeygenLicenseVerifierTest {

    private static final String CERT_PREFIX = "-----BEGIN LICENSE FILE-----";
    private static final String CERT_SUFFIX = "-----END LICENSE FILE-----";
    private static final String ACCOUNT_ID = "e5430f69-e834-4ae4-befd-b602aae5f372";

    private ObjectMapper objectMapper;
    private ApplicationProperties applicationProperties;
    private KeygenLicenseVerifier verifier;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        applicationProperties = new ApplicationProperties();
        verifier = new KeygenLicenseVerifier(objectMapper, applicationProperties);
    }

    // Builds a license file string: base64 of {enc, sig, alg}.
    private String buildCertificate(String encB64, String sigB64, String alg) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("enc", encB64);
        root.put("sig", sigB64);
        root.put("alg", alg);
        String inner = Base64.getEncoder().encodeToString(root.toString().getBytes());
        return CERT_PREFIX + "\n" + inner + "\n" + CERT_SUFFIX;
    }

    // Reflectively builds a private LicenseContext instance.
    private Object newContext() throws Exception {
        Class<?> ctxClass =
                Class.forName(
                        "stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier$LicenseContext");
        Constructor<?> ctor = ctxClass.getDeclaredConstructor();
        ctor.setAccessible(true);
        return ctor.newInstance();
    }

    private boolean readContextBoolean(Object ctx, String field) throws Exception {
        Field f = ctx.getClass().getDeclaredField(field);
        f.setAccessible(true);
        return f.getBoolean(ctx);
    }

    private int readContextInt(Object ctx, String field) throws Exception {
        Field f = ctx.getClass().getDeclaredField(field);
        f.setAccessible(true);
        return f.getInt(ctx);
    }

    private Object invokePrivate(String name, Class<?>[] types, Object... args) throws Exception {
        Method m = KeygenLicenseVerifier.class.getDeclaredMethod(name, types);
        m.setAccessible(true);
        return m.invoke(verifier, args);
    }

    @Nested
    @DisplayName("verifyLicense - top-level dispatch")
    class VerifyLicenseDispatch {

        @Test
        @DisplayName("returns NORMAL when premium is disabled without touching the network")
        void premiumDisabled_returnsNormal() {
            applicationProperties.getPremium().setEnabled(false);

            License result = verifier.verifyLicense("anything-at-all");

            assertThat(result).isEqualTo(License.NORMAL);
        }

        @Test
        @DisplayName("certificate license with invalid signature resolves to NORMAL")
        void certificateInvalidSignature_returnsNormal() {
            applicationProperties.getPremium().setEnabled(true);
            String payload = Base64.getEncoder().encodeToString("{}".getBytes());
            String badSig = Base64.getEncoder().encodeToString("not-a-real-signature".getBytes());
            String cert = buildCertificate(payload, badSig, "base64+ed25519");

            License result = verifier.verifyLicense(cert);

            assertThat(result).isEqualTo(License.NORMAL);
        }

        @Test
        @DisplayName("certificate license with unsupported algorithm resolves to NORMAL")
        void certificateUnsupportedAlgorithm_returnsNormal() {
            applicationProperties.getPremium().setEnabled(true);
            String cert = buildCertificate("ZW5j", "c2ln", "rsa-sha256");

            License result = verifier.verifyLicense(cert);

            assertThat(result).isEqualTo(License.NORMAL);
        }

        @Test
        @DisplayName("certificate license with non-JSON payload resolves to NORMAL")
        void certificateMalformedPayload_returnsNormal() {
            applicationProperties.getPremium().setEnabled(true);
            String notJson = Base64.getEncoder().encodeToString("this is not json".getBytes());
            String cert = CERT_PREFIX + "\n" + notJson + "\n" + CERT_SUFFIX;

            License result = verifier.verifyLicense(cert);

            assertThat(result).isEqualTo(License.NORMAL);
        }

        @Test
        @DisplayName("JWT-style license with invalid signature resolves to NORMAL")
        void jwtInvalidSignature_returnsNormal() {
            applicationProperties.getPremium().setEnabled(true);
            String body = Base64.getUrlEncoder().withoutPadding().encodeToString("{}".getBytes());
            String sig = Base64.getUrlEncoder().withoutPadding().encodeToString("bad".getBytes());
            String jwt = "key/" + body + "." + sig;

            License result = verifier.verifyLicense(jwt);

            assertThat(result).isEqualTo(License.NORMAL);
        }

        @Test
        @DisplayName("JWT-style license with missing signature separator resolves to NORMAL")
        void jwtMissingSeparator_returnsNormal() {
            applicationProperties.getPremium().setEnabled(true);
            String jwt = "key/onlypayloadnodot";

            License result = verifier.verifyLicense(jwt);

            assertThat(result).isEqualTo(License.NORMAL);
        }
    }

    @Nested
    @DisplayName("verifyEd25519Signature")
    class Ed25519Signature {

        @Test
        @DisplayName("returns false for a forged signature")
        void forgedSignature_returnsFalse() throws Exception {
            String sig = Base64.getEncoder().encodeToString(new byte[64]);
            Object result =
                    invokePrivate(
                            "verifyEd25519Signature",
                            new Class<?>[] {String.class, String.class},
                            "some-encrypted-data",
                            sig);
            assertThat((Boolean) result).isFalse();
        }

        @Test
        @DisplayName("returns false when signature is not valid base64")
        void invalidBase64Signature_returnsFalse() throws Exception {
            Object result =
                    invokePrivate(
                            "verifyEd25519Signature",
                            new Class<?>[] {String.class, String.class},
                            "data",
                            "@@@not-base64@@@");
            assertThat((Boolean) result).isFalse();
        }
    }

    @Nested
    @DisplayName("verifyJWTSignature")
    class JwtSignature {

        @Test
        @DisplayName("returns false for a forged signature")
        void forgedSignature_returnsFalse() throws Exception {
            String sig = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[64]);
            Object result =
                    invokePrivate(
                            "verifyJWTSignature",
                            new Class<?>[] {String.class, String.class},
                            "payload",
                            sig);
            assertThat((Boolean) result).isFalse();
        }
    }

    @Nested
    @DisplayName("processCertificateData")
    class ProcessCertificateData {

        private boolean process(String json) throws Exception {
            Object ctx = newContext();
            Class<?> ctxClass = ctx.getClass();
            Object result =
                    invokePrivate(
                            "processCertificateData",
                            new Class<?>[] {String.class, ctxClass},
                            json,
                            ctx);
            return (Boolean) result;
        }

        @Test
        @DisplayName("valid SERVER license (no enterprise flag) returns true and sets maxUsers 0")
        void serverLicense_returnsTrue() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            ObjectNode data = root.putObject("data");
            ObjectNode attrs = data.putObject("attributes");
            attrs.put("floating", false);
            attrs.put("maxMachines", 1);
            ObjectNode metadata = attrs.putObject("metadata");
            metadata.put("isEnterprise", false);
            metadata.put("users", 0);
            attrs.put("status", "ACTIVE");

            boolean valid = process(root.toString());

            assertThat(valid).isTrue();
            assertThat(applicationProperties.getPremium().getMaxUsers()).isZero();
        }

        @Test
        @DisplayName("valid ENTERPRISE license sets maxUsers from metadata")
        void enterpriseLicense_setsMaxUsers() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            ObjectNode data = root.putObject("data");
            ObjectNode attrs = data.putObject("attributes");
            ObjectNode metadata = attrs.putObject("metadata");
            metadata.put("isEnterprise", true);
            metadata.put("users", 25);
            attrs.put("status", "EXPIRING");

            boolean valid = process(root.toString());

            assertThat(valid).isTrue();
            assertThat(applicationProperties.getPremium().getMaxUsers()).isEqualTo(25);
        }

        @Test
        @DisplayName("expired license (expiry in past) returns false")
        void expiredLicense_returnsFalse() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            ObjectNode meta = root.putObject("meta");
            meta.put("issued", Instant.now().minusSeconds(100000).toString());
            meta.put("expiry", Instant.now().minusSeconds(1000).toString());
            root.putObject("data").putObject("attributes");

            boolean valid = process(root.toString());

            assertThat(valid).isFalse();
        }

        @Test
        @DisplayName("issued date in the future returns false")
        void futureIssued_returnsFalse() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            ObjectNode meta = root.putObject("meta");
            meta.put("issued", Instant.now().plusSeconds(100000).toString());
            meta.put("expiry", Instant.now().plusSeconds(200000).toString());
            root.putObject("data").putObject("attributes");

            boolean valid = process(root.toString());

            assertThat(valid).isFalse();
        }

        @Test
        @DisplayName("non-active status returns false")
        void inactiveStatus_returnsFalse() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            ObjectNode data = root.putObject("data");
            ObjectNode attrs = data.putObject("attributes");
            attrs.put("status", "SUSPENDED");

            boolean valid = process(root.toString());

            assertThat(valid).isFalse();
        }

        @Test
        @DisplayName("missing data object returns false")
        void missingData_returnsFalse() throws Exception {
            boolean valid = process("{}");
            assertThat(valid).isFalse();
        }

        @Test
        @DisplayName("valid dates with active status returns true")
        void validDates_returnsTrue() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            ObjectNode meta = root.putObject("meta");
            meta.put("issued", Instant.now().minusSeconds(1000).toString());
            meta.put("expiry", Instant.now().plusSeconds(1000).toString());
            ObjectNode data = root.putObject("data");
            data.putObject("attributes").put("status", "ACTIVE");

            boolean valid = process(root.toString());

            assertThat(valid).isTrue();
        }

        @Test
        @DisplayName("floating license attribute populates context")
        void floatingLicense_populatesContext() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            ObjectNode attrs = root.putObject("data").putObject("attributes");
            attrs.put("floating", true);
            attrs.put("maxMachines", 7);

            Object ctx = newContext();
            Object result =
                    invokePrivate(
                            "processCertificateData",
                            new Class<?>[] {String.class, ctx.getClass()},
                            root.toString(),
                            ctx);

            assertThat((Boolean) result).isTrue();
            assertThat(readContextBoolean(ctx, "isFloatingLicense")).isTrue();
            assertThat(readContextInt(ctx, "maxMachines")).isEqualTo(7);
        }
    }

    @Nested
    @DisplayName("processJWTLicensePayload")
    class ProcessJwtPayload {

        private Object processWithContext(String json, Object ctx) throws Exception {
            return invokePrivate(
                    "processJWTLicensePayload",
                    new Class<?>[] {String.class, ctx.getClass()},
                    json,
                    ctx);
        }

        @Test
        @DisplayName("payload with nested license object and no expiry returns true")
        void nestedLicenseNoExpiry_returnsTrue() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            ObjectNode license = root.putObject("license");
            license.put("id", "lic-123");
            license.put("floating", false);

            Object ctx = newContext();
            Object result = processWithContext(root.toString(), ctx);

            assertThat((Boolean) result).isTrue();
        }

        @Test
        @DisplayName("payload using root object as license (id at root) returns true")
        void rootAsLicense_returnsTrue() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            root.put("id", "root-lic");

            Object ctx = newContext();
            Object result = processWithContext(root.toString(), ctx);

            assertThat((Boolean) result).isTrue();
        }

        @Test
        @DisplayName("payload missing license object and id returns false")
        void missingLicenseAndId_returnsFalse() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            root.putObject("other").put("foo", "bar");

            Object ctx = newContext();
            Object result = processWithContext(root.toString(), ctx);

            assertThat((Boolean) result).isFalse();
        }

        @Test
        @DisplayName("expired JWT license returns false")
        void expiredJwt_returnsFalse() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            ObjectNode license = root.putObject("license");
            license.put("id", "lic-exp");
            license.put("expiry", Instant.now().minusSeconds(1000).toString());

            Object ctx = newContext();
            Object result = processWithContext(root.toString(), ctx);

            assertThat((Boolean) result).isFalse();
        }

        @Test
        @DisplayName("floating license in license object populates context")
        void floatingInLicense_populatesContext() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            ObjectNode license = root.putObject("license");
            license.put("id", "lic-float");
            license.put("floating", true);
            license.put("maxMachines", 3);

            Object ctx = newContext();
            Object result = processWithContext(root.toString(), ctx);

            assertThat((Boolean) result).isTrue();
            assertThat(readContextBoolean(ctx, "isFloatingLicense")).isTrue();
            assertThat(readContextInt(ctx, "maxMachines")).isEqualTo(3);
        }

        @Test
        @DisplayName("account id mismatch still returns true but warns")
        void accountMismatch_returnsTrue() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            root.putObject("license").put("id", "lic-acc");
            root.putObject("account").put("id", "some-other-account");

            Object ctx = newContext();
            Object result = processWithContext(root.toString(), ctx);

            assertThat((Boolean) result).isTrue();
        }

        @Test
        @DisplayName("policy floating + enterprise users set context and maxUsers")
        void policyEnterprise_setsContextAndMaxUsers() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            root.putObject("license").put("id", "lic-policy");
            root.putObject("account").put("id", ACCOUNT_ID);
            ObjectNode policy = root.putObject("policy");
            policy.put("id", "pol-1");
            policy.put("floating", true);
            policy.put("maxMachines", 9);
            policy.put("isEnterprise", true);
            policy.put("users", 50);

            Object ctx = newContext();
            Object result = processWithContext(root.toString(), ctx);

            assertThat((Boolean) result).isTrue();
            assertThat(readContextBoolean(ctx, "isFloatingLicense")).isTrue();
            assertThat(readContextInt(ctx, "maxMachines")).isEqualTo(9);
            assertThat(applicationProperties.getPremium().getMaxUsers()).isEqualTo(50);
        }

        @Test
        @DisplayName("policy users from metadata fallback when not at policy level")
        void policyUsersFromMetadata_setsMaxUsers() throws Exception {
            ObjectNode root = objectMapper.createObjectNode();
            root.putObject("license").put("id", "lic-meta");
            ObjectNode policy = root.putObject("policy");
            policy.put("id", "pol-meta");
            ObjectNode metadata = policy.putObject("metadata");
            metadata.put("isEnterprise", true);
            metadata.put("users", 12);

            Object ctx = newContext();
            Object result = processWithContext(root.toString(), ctx);

            assertThat((Boolean) result).isTrue();
            assertThat(applicationProperties.getPremium().getMaxUsers()).isEqualTo(12);
        }

        @Test
        @DisplayName("malformed JSON payload returns false")
        void malformedJson_returnsFalse() throws Exception {
            Object ctx = newContext();
            Object result = processWithContext("not-json-at-all", ctx);
            assertThat((Boolean) result).isFalse();
        }
    }
}
