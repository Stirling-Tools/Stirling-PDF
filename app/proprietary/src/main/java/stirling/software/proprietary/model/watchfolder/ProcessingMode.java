package stirling.software.proprietary.model.watchfolder;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Where the automation pipeline runs.
 *
 * <ul>
 *   <li>{@link #LOCAL} — runs entirely in the user's browser.</li>
 *   <li>{@link #SERVER} — runs on the server (forced when {@link InputSource#SERVER_FOLDER} is in
 *       use).</li>
 * </ul>
 */
public enum ProcessingMode {
    LOCAL("local"),
    SERVER("server");

    private final String wire;

    ProcessingMode(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wireValue() {
        return wire;
    }

    @JsonCreator
    public static ProcessingMode fromWire(String value) {
        if (value == null) return null;
        for (ProcessingMode s : values()) {
            if (s.wire.equalsIgnoreCase(value)) return s;
        }
        throw new IllegalArgumentException("Unknown ProcessingMode: " + value);
    }

    @Converter(autoApply = true)
    public static class DbConverter implements AttributeConverter<ProcessingMode, String> {
        @Override
        public String convertToDatabaseColumn(ProcessingMode attribute) {
            return attribute == null ? null : attribute.wire;
        }

        @Override
        public ProcessingMode convertToEntityAttribute(String dbData) {
            return fromWire(dbData);
        }
    }
}
