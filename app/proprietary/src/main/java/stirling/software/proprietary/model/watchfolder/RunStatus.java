package stirling.software.proprietary.model.watchfolder;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Status of a single run entry — a completed (or in-flight) execution of the folder's automation
 * over one input file. Wire/DB values match the frontend {@code SmartFolderRunEntry.status} union.
 */
public enum RunStatus {
    PROCESSING("processing"),
    PROCESSED("processed");

    private final String wire;

    RunStatus(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wireValue() {
        return wire;
    }

    @JsonCreator
    public static RunStatus fromWire(String value) {
        if (value == null) return null;
        for (RunStatus s : values()) {
            if (s.wire.equalsIgnoreCase(value)) return s;
        }
        throw new IllegalArgumentException("Unknown RunStatus: " + value);
    }

    @Converter(autoApply = true)
    public static class DbConverter implements AttributeConverter<RunStatus, String> {
        @Override
        public String convertToDatabaseColumn(RunStatus attribute) {
            return attribute == null ? null : attribute.wire;
        }

        @Override
        public RunStatus convertToEntityAttribute(String dbData) {
            return fromWire(dbData);
        }
    }
}
