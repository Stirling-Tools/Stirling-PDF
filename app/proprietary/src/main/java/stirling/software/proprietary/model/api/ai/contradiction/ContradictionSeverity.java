package stirling.software.proprietary.model.api.ai.contradiction;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Severity of a textual contradiction found by the Contradiction Agent.
 *
 * <p>Java counterpart: {@code ContradictionSeverity} in {@code contracts/contradiction.py} — values
 * must stay in sync.
 */
public enum ContradictionSeverity {
    ERROR,
    WARNING;

    @JsonValue
    public String toJson() {
        return name().toLowerCase();
    }
}
