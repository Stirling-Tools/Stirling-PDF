package stirling.software.proprietary.model.api.ai;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Severity of a mathematical discrepancy. Mirrors the Python {@code Severity} enum in {@code
 * contracts/ledger.py}.
 */
public enum AuditSeverity {
    ERROR,
    WARNING;

    @JsonValue
    public String toJson() {
        return name().toLowerCase();
    }
}
