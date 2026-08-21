package stirling.software.proprietary.integration.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Base64;

import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class CredentialEncryptionTest {

    @BeforeAll
    static void initKey() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        SecretKey key = generator.generateKey();
        CredentialEncryption.initialiseForTesting(key);
    }

    @Test
    void roundTripRecoversPlaintext() {
        String plaintext = "s3-secret-key-ABC123/+=value";
        String encrypted = CredentialEncryption.encrypt(plaintext);

        assertThat(encrypted).isNotNull().isNotEqualTo(plaintext);
        assertThat(CredentialEncryption.decrypt(encrypted)).isEqualTo(plaintext);
    }

    @Test
    void sameInputProducesDifferentCiphertext() {
        String plaintext = "repeated-secret";

        // Random IV per encryption => ciphertext must differ, but both decrypt back.
        String first = CredentialEncryption.encrypt(plaintext);
        String second = CredentialEncryption.encrypt(plaintext);

        assertThat(first).isNotEqualTo(second);
        assertThat(CredentialEncryption.decrypt(first)).isEqualTo(plaintext);
        assertThat(CredentialEncryption.decrypt(second)).isEqualTo(plaintext);
    }

    @Test
    void nullsPassThrough() {
        assertThat(CredentialEncryption.encrypt(null)).isNull();
        assertThat(CredentialEncryption.decrypt(null)).isNull();
    }

    @Test
    void tamperedCiphertextIsRejected() {
        // GCM is authenticated: flipping a byte of the stored blob must fail decryption, not
        // silently return corrupted plaintext.
        String encrypted = CredentialEncryption.encrypt("top-secret");
        byte[] raw = Base64.getDecoder().decode(encrypted);
        raw[raw.length - 1] ^= 0x01;
        String tampered = Base64.getEncoder().encodeToString(raw);

        assertThatThrownBy(() -> CredentialEncryption.decrypt(tampered))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void encryptStaysBase64SoStringColumnsKeepTheirWireFormat() {
        assertThat(Base64.getDecoder().decode(CredentialEncryption.encrypt("secret"))).isNotEmpty();
    }

    @Test
    void byteRoundTripRecoversPlaintext() {
        // Not valid UTF-8: the byte path must not go via a charset.
        byte[] plaintext = new byte[] {0, -1, 0x7F, -128};

        byte[] encrypted = CredentialEncryption.encryptBytes(plaintext);

        assertThat(encrypted).isNotEqualTo(plaintext);
        assertThat(CredentialEncryption.decryptBytes(encrypted)).isEqualTo(plaintext);
    }

    @Test
    void sameBytesProduceDifferentCiphertext() {
        byte[] plaintext = "repeated-secret".getBytes();

        byte[] first = CredentialEncryption.encryptBytes(plaintext);
        byte[] second = CredentialEncryption.encryptBytes(plaintext);

        assertThat(first).isNotEqualTo(second);
        assertThat(CredentialEncryption.decryptBytes(first)).isEqualTo(plaintext);
        assertThat(CredentialEncryption.decryptBytes(second)).isEqualTo(plaintext);
    }

    @Test
    void tamperedBlobIsRejected() {
        byte[] encrypted = CredentialEncryption.encryptBytes("top-secret".getBytes());
        encrypted[encrypted.length - 1] ^= 0x01;

        assertThatThrownBy(() -> CredentialEncryption.decryptBytes(encrypted))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void nullBytesPassThrough() {
        assertThat(CredentialEncryption.encryptBytes(null)).isNull();
        assertThat(CredentialEncryption.decryptBytes(null)).isNull();
    }
}
