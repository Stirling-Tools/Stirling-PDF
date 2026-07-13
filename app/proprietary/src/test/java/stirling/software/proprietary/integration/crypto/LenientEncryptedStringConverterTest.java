package stirling.software.proprietary.integration.crypto;

import static org.assertj.core.api.Assertions.assertThat;

import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class LenientEncryptedStringConverterTest {

    private final LenientEncryptedStringConverter converter = new LenientEncryptedStringConverter();

    @BeforeAll
    static void initKey() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        SecretKey key = generator.generateKey();
        CredentialEncryption.initialiseForTesting(key);
    }

    @Test
    void roundTripsThroughCiphertext() {
        String json = "{\"bucket\":\"inbox\",\"secretAccessKey\":\"shh\"}";

        String stored = converter.convertToDatabaseColumn(json);

        assertThat(stored).isNotEqualTo(json).doesNotContain("shh");
        assertThat(converter.convertToEntityAttribute(stored)).isEqualTo(json);
    }

    @Test
    void legacyPlaintextRowsPassThroughOnRead() {
        String legacy = "{\"bucket\":\"inbox\",\"mode\":\"consume\"}";

        assertThat(converter.convertToEntityAttribute(legacy)).isEqualTo(legacy);
    }

    @Test
    void nullsPassThrough() {
        assertThat(converter.convertToDatabaseColumn(null)).isNull();
        assertThat(converter.convertToEntityAttribute(null)).isNull();
    }
}
