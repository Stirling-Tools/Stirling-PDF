package stirling.software.proprietary.model.docparse;

import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Which implementation actually served a request. Wire values are lowercase to match {@code
 * engine/src/stirling/contracts/docparse.py DocparseTier}.
 */
public enum DocparseTier {
    BASIC("basic"),
    ADVANCED("advanced");

    private final String wire;

    DocparseTier(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @JsonCreator
    public static DocparseTier fromWire(String value) {
        return valueOf(value.trim().toUpperCase(Locale.ROOT));
    }
}
