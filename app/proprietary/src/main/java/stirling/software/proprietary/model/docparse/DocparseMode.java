package stirling.software.proprietary.model.docparse;

import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * What the caller asked for; {@code AUTO} resolves per request. Wire values are lowercase to match
 * {@code engine/src/stirling/contracts/docparse.py DocparseMode}.
 */
public enum DocparseMode {
    AUTO("auto"),
    BASIC("basic"),
    ADVANCED("advanced");

    private final String wire;

    DocparseMode(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static DocparseMode fromWire(String value) {
        if (value == null || value.isBlank()) {
            return AUTO;
        }
        return valueOf(value.trim().toUpperCase(Locale.ROOT));
    }
}
