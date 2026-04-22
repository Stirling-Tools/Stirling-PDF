package stirling.software.proprietary.model.watchfolder;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * How automation output files are produced.
 *
 * <ul>
 *   <li>{@link #NEW_FILE} — always produce a new, separately-named file.</li>
 *   <li>{@link #NEW_VERSION} — produce a new version of the input file (replacing / versioning
 *       semantics handled client-side).</li>
 * </ul>
 */
public enum OutputMode {
    NEW_FILE("new_file"),
    NEW_VERSION("new_version");

    private final String wire;

    OutputMode(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wireValue() {
        return wire;
    }

    @JsonCreator
    public static OutputMode fromWire(String value) {
        if (value == null) return null;
        for (OutputMode s : values()) {
            if (s.wire.equalsIgnoreCase(value)) return s;
        }
        throw new IllegalArgumentException("Unknown OutputMode: " + value);
    }

    @Converter(autoApply = true)
    public static class DbConverter implements AttributeConverter<OutputMode, String> {
        @Override
        public String convertToDatabaseColumn(OutputMode attribute) {
            return attribute == null ? null : attribute.wire;
        }

        @Override
        public OutputMode convertToEntityAttribute(String dbData) {
            return fromWire(dbData);
        }
    }
}
