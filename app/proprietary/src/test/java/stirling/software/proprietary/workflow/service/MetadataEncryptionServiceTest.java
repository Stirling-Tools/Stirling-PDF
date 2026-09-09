package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AutomaticallyGenerated;

class MetadataEncryptionServiceTest {

    private MetadataEncryptionService service;

    @BeforeEach
    void setUp() {
        service = serviceWithKey("test-encryption-key-for-unit-tests-only");
    }

    private static MetadataEncryptionService serviceWithKey(String key) {
        AutomaticallyGenerated generated = new AutomaticallyGenerated();
        generated.setKey(key);
        ApplicationProperties props = new ApplicationProperties();
        props.setAutomaticallyGenerated(generated);
        return new MetadataEncryptionService(props);
    }

    // -------------------------------------------------------------------------
    // Null / empty passthrough
    // -------------------------------------------------------------------------

    @Test
    void encrypt_null_returnsNull() {
        assertThat(service.encrypt(null)).isNull();
    }

    @Test
    void decrypt_null_returnsNull() {
        assertThat(service.decrypt(null)).isNull();
    }

    // -------------------------------------------------------------------------
    // Legacy plaintext backwards-compatibility
    // -------------------------------------------------------------------------

    @Test
    void decrypt_plaintextWithoutPrefix_returnsUnchanged() {
        assertThat(service.decrypt("plaintext-password")).isEqualTo("plaintext-password");
    }

    @Test
    void decrypt_emptyStringWithoutPrefix_returnsUnchanged() {
        assertThat(service.decrypt("")).isEqualTo("");
    }

    // -------------------------------------------------------------------------
    // Encrypt / decrypt round-trip
    // -------------------------------------------------------------------------

    @Test
    void encrypt_producesEncPrefix() {
        String encrypted = service.encrypt("secret");
        assertThat(encrypted).startsWith(MetadataEncryptionService.ENC_PREFIX);
    }

    @Test
    void roundTrip_restoresOriginalValue() {
        String original = "my-keystore-password";
        String encrypted = service.encrypt(original);
        assertThat(service.decrypt(encrypted)).isEqualTo(original);
    }

    @Test
    void roundTrip_emptyString() {
        String encrypted = service.encrypt("");
        assertThat(service.decrypt(encrypted)).isEqualTo("");
    }

    @Test
    void roundTrip_specialCharactersAndUnicode() {
        String original = "p@$$w0rd!£€#\u00e9";
        assertThat(service.decrypt(service.encrypt(original))).isEqualTo(original);
    }

    // -------------------------------------------------------------------------
    // IV randomisation — each call must produce a distinct ciphertext
    // -------------------------------------------------------------------------

    @Test
    void encrypt_sameInput_producesDifferentCiphertexts() {
        String a = service.encrypt("same-value");
        String b = service.encrypt("same-value");
        assertThat(a).isNotEqualTo(b);
    }

    // -------------------------------------------------------------------------
    // Key dependency — different keys must produce different ciphertexts
    // -------------------------------------------------------------------------

    @Test
    void encrypt_differentKey_producesIncompatibleCiphertext() {
        MetadataEncryptionService otherService = serviceWithKey("completely-different-key");

        String encryptedByOther = otherService.encrypt("secret");

        // The original service cannot decrypt what the other service encrypted
        assertThatThrownBy(() -> service.decrypt(encryptedByOther))
                .isInstanceOf(IllegalStateException.class);
    }

    // -------------------------------------------------------------------------
    // Missing key guard
    // -------------------------------------------------------------------------

    @Test
    void encrypt_missingKey_throwsIllegalState() {
        MetadataEncryptionService noKeyService = serviceWithKey(null);

        assertThatThrownBy(() -> noKeyService.encrypt("anything"))
                .isInstanceOf(IllegalStateException.class);
    }

    // -------------------------------------------------------------------------
    // Byte-array (keystore) round-trip
    // -------------------------------------------------------------------------

    @Test
    void encryptBytes_null_returnsNull() {
        assertThat(service.encryptBytes(null)).isNull();
    }

    @Test
    void decryptBytes_null_returnsNull() {
        assertThat(service.decryptBytes(null)).isNull();
    }

    @Test
    void encryptBytes_producesEncPrefix() {
        String encrypted = service.encryptBytes(new byte[] {1, 2, 3});
        assertThat(encrypted).startsWith(MetadataEncryptionService.ENC_PREFIX);
    }

    @Test
    void byteRoundTrip_restoresOriginalBytes() {
        byte[] original = {0, 1, 2, (byte) 0xFF, 64, 65, 66};
        assertThat(service.decryptBytes(service.encryptBytes(original))).isEqualTo(original);
    }

    @Test
    void decryptBytes_legacyPlainBase64_stillDecodes() {
        // Values written before keystore encryption was introduced are stored as plain Base64
        // (no enc: prefix) and must still decode.
        byte[] original = {10, 20, 30};
        String legacy = java.util.Base64.getEncoder().encodeToString(original);
        assertThat(service.decryptBytes(legacy)).isEqualTo(original);
    }
}
