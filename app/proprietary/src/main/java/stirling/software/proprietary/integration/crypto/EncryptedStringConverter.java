package stirling.software.proprietary.integration.crypto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Transparently encrypts/decrypts a string column at rest via {@link CredentialEncryption}. */
@Converter
public class EncryptedStringConverter implements AttributeConverter<String, String> {

    @Override
    public String convertToDatabaseColumn(String attribute) {
        return CredentialEncryption.encrypt(attribute);
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        return CredentialEncryption.decrypt(dbData);
    }
}
