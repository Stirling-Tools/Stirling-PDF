package stirling.software.proprietary.model.watchfolder;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Lifecycle status of a single file tracked inside a watch folder. Wire/DB values are lowercase and
 * match the frontend {@code FolderFileMetadata.status} union.
 */
public enum FileStatus {
    PENDING("pending"),
    PROCESSING("processing"),
    PROCESSED("processed"),
    ERROR("error");

    private final String wire;

    FileStatus(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wireValue() {
        return wire;
    }

    @JsonCreator
    public static FileStatus fromWire(String value) {
        if (value == null) return null;
        for (FileStatus s : values()) {
            if (s.wire.equalsIgnoreCase(value)) return s;
        }
        throw new IllegalArgumentException("Unknown FileStatus: " + value);
    }

    @Converter(autoApply = true)
    public static class DbConverter implements AttributeConverter<FileStatus, String> {
        @Override
        public String convertToDatabaseColumn(FileStatus attribute) {
            return attribute == null ? null : attribute.wire;
        }

        @Override
        public FileStatus convertToEntityAttribute(String dbData) {
            return fromWire(dbData);
        }
    }
}
