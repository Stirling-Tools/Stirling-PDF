package stirling.software.proprietary.integration.crypto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * For columns that were once whole-blob encrypted but no longer hold secrets.
 *
 * <p>Writes plaintext, so the value is readable by any instance regardless of the per-installation
 * encryption key. Any value that isn't our ciphertext (already-plaintext JSON, or ciphertext from a
 * key we don't hold) is returned as-is; the latter is the caller's to reject.
 */
@Converter
public class LegacyDecryptStringConverter implements AttributeConverter<String, String> {

    @Override
    public String convertToDatabaseColumn(String attribute) {
        return attribute;
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        try {
            return CredentialEncryption.decrypt(dbData);
        } catch (IllegalArgumentException | IllegalStateException e) {
            // Plaintext (JSON never looks like our Base64 ciphertext), or ciphertext we can't read.
            return dbData;
        }
    }
}
