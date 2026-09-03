package stirling.software.proprietary.storage.converter;

import java.util.Locale;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.storage.model.FileShareAccessType;

/**
 * Persists the access type as plain text. {@code @Enumerated(STRING)} makes Hibernate emit a native
 * enum column on H2/MySQL, which {@code ddl-auto=update} never widens, so every new constant would
 * be unwritable on existing installs.
 */
@Converter
@Slf4j
public class FileShareAccessTypeConverter
        implements AttributeConverter<FileShareAccessType, String> {

    @Override
    public String convertToDatabaseColumn(FileShareAccessType attribute) {
        return attribute != null ? attribute.name() : null;
    }

    @Override
    public FileShareAccessType convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return null;
        }
        try {
            return FileShareAccessType.valueOf(dbData.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            // A row written by a newer version must not break the reader.
            log.warn("Unknown file share access type {} in database", dbData);
            return null;
        }
    }
}
