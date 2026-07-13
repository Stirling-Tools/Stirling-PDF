package stirling.software.proprietary.integration.crypto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * {@link EncryptedStringConverter} for columns that held plaintext before encryption shipped:
 * writes are always encrypted, but a stored value that is not valid ciphertext is returned as-is,
 * so pre-encryption rows keep loading and become encrypted on their next save. The discrimination
 * is exact for JSON payloads, which can never be mistaken for ciphertext ('{' is not in the Base64
 * alphabet). The trade-off is that a genuinely corrupted ciphertext surfaces as garbage to the
 * caller's parser instead of failing here.
 */
@Converter
public class LenientEncryptedStringConverter implements AttributeConverter<String, String> {

    @Override
    public String convertToDatabaseColumn(String attribute) {
        return CredentialEncryption.encrypt(attribute);
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        try {
            return CredentialEncryption.decrypt(dbData);
        } catch (IllegalArgumentException | IllegalStateException e) {
            // Not ciphertext: legacy plaintext from before encryption shipped.
            return dbData;
        }
    }
}
