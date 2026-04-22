package stirling.software.proprietary.model.watchfolder;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Visibility scope of a {@code WatchFolder}.
 *
 * <ul>
 *   <li>{@link #PERSONAL} — only the owner can see / modify the folder.</li>
 *   <li>{@link #ORGANISATION} — visible to every authenticated user; only admins may create or
 *       modify.</li>
 * </ul>
 */
public enum FolderScope {
    PERSONAL,
    ORGANISATION;

    @JsonValue
    public String wireValue() {
        return name();
    }

    @JsonCreator
    public static FolderScope fromWire(String value) {
        if (value == null) return null;
        for (FolderScope s : values()) {
            if (s.name().equalsIgnoreCase(value)) return s;
        }
        throw new IllegalArgumentException("Unknown FolderScope: " + value);
    }

    @Converter(autoApply = true)
    public static class DbConverter implements AttributeConverter<FolderScope, String> {
        @Override
        public String convertToDatabaseColumn(FolderScope attribute) {
            return attribute == null ? null : attribute.name();
        }

        @Override
        public FolderScope convertToEntityAttribute(String dbData) {
            return fromWire(dbData);
        }
    }
}
