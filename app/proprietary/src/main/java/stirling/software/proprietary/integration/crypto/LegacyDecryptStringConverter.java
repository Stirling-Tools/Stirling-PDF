package stirling.software.proprietary.integration.crypto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * For columns that were once whole-blob encrypted but no longer hold secrets - the policy / source
 * JSON, whose only sensitive fields (S3 credentials) now live in a referenced {@link
 * stirling.software.proprietary.integration.model.IntegrationConfig} connection, which stays
 * encrypted via {@link EncryptedStringConverter}.
 *
 * <p>Writes plaintext, so the value is readable by any instance regardless of the per-installation
 * encryption key (this is what makes a shared database portable and removes the "one undecryptable
 * row bricks startup" failure mode). On read it still decrypts a legacy ciphertext value - written
 * before this change, with the local key - so existing rows keep loading and become plaintext on
 * their next save. A value that isn't our ciphertext (already-plaintext JSON, or ciphertext from a
 * key we don't hold) is returned as-is; the latter is the caller's to reject, same trade-off the
 * old lenient converter documented.
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
