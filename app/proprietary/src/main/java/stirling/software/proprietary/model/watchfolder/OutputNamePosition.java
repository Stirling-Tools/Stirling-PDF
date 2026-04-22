package stirling.software.proprietary.model.watchfolder;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Where the configured {@code outputName} string is placed relative to the input filename when
 * building an output file name. {@link #AUTO_NUMBER} appends a monotonically increasing counter.
 */
public enum OutputNamePosition {
    PREFIX("prefix"),
    SUFFIX("suffix"),
    AUTO_NUMBER("auto-number");

    private final String wire;

    OutputNamePosition(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wireValue() {
        return wire;
    }

    @JsonCreator
    public static OutputNamePosition fromWire(String value) {
        if (value == null) return null;
        for (OutputNamePosition s : values()) {
            if (s.wire.equalsIgnoreCase(value)) return s;
        }
        throw new IllegalArgumentException("Unknown OutputNamePosition: " + value);
    }

    @Converter(autoApply = true)
    public static class DbConverter implements AttributeConverter<OutputNamePosition, String> {
        @Override
        public String convertToDatabaseColumn(OutputNamePosition attribute) {
            return attribute == null ? null : attribute.wire;
        }

        @Override
        public OutputNamePosition convertToEntityAttribute(String dbData) {
            return fromWire(dbData);
        }
    }
}
