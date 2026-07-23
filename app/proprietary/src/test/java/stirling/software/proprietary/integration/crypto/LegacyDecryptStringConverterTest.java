package stirling.software.proprietary.integration.crypto;

import static org.assertj.core.api.Assertions.assertThat;

import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class LegacyDecryptStringConverterTest {

    private final LegacyDecryptStringConverter converter = new LegacyDecryptStringConverter();

    @BeforeAll
    static void initKey() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        SecretKey key = generator.generateKey();
        CredentialEncryption.initialiseForTesting(key);
    }

    @Test
    void writesPlaintext() {
        String json = "{\"bucket\":\"inbox\",\"mode\":\"consume\"}";

        assertThat(converter.convertToDatabaseColumn(json)).isEqualTo(json);
    }

    @Test
    void decryptsLegacyCiphertextOnRead() {
        String json = "{\"bucket\":\"inbox\"}";
        String legacyCiphertext = CredentialEncryption.encrypt(json);

        assertThat(legacyCiphertext).isNotEqualTo(json);
        assertThat(converter.convertToEntityAttribute(legacyCiphertext)).isEqualTo(json);
    }

    @Test
    void passesPlaintextThroughOnRead() {
        String json = "{\"bucket\":\"inbox\",\"mode\":\"consume\"}";

        assertThat(converter.convertToEntityAttribute(json)).isEqualTo(json);
    }

    @Test
    void nullsPassThrough() {
        assertThat(converter.convertToDatabaseColumn(null)).isNull();
        assertThat(converter.convertToEntityAttribute(null)).isNull();
    }
}
