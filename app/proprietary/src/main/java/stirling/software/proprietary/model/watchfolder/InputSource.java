package stirling.software.proprietary.model.watchfolder;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Where input files for a watch folder come from.
 *
 * <ul>
 *   <li>{@link #IDB} — files dropped / picked in the browser, stored in IndexedDB.</li>
 *   <li>{@link #LOCAL_FOLDER} — a real folder on the user's machine (desktop build).</li>
 *   <li>{@link #SERVER_FOLDER} — a directory watched on the server.</li>
 * </ul>
 */
public enum InputSource {
    IDB("idb"),
    LOCAL_FOLDER("local-folder"),
    SERVER_FOLDER("server-folder");

    private final String wire;

    InputSource(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wireValue() {
        return wire;
    }

    @JsonCreator
    public static InputSource fromWire(String value) {
        if (value == null) return null;
        for (InputSource s : values()) {
            if (s.wire.equalsIgnoreCase(value)) return s;
        }
        throw new IllegalArgumentException("Unknown InputSource: " + value);
    }

    @Converter(autoApply = true)
    public static class DbConverter implements AttributeConverter<InputSource, String> {
        @Override
        public String convertToDatabaseColumn(InputSource attribute) {
            return attribute == null ? null : attribute.wire;
        }

        @Override
        public InputSource convertToEntityAttribute(String dbData) {
            return fromWire(dbData);
        }
    }
}
