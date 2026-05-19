package stirling.software.proprietary.model.api.ai;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Category of a mathematical discrepancy found by the auditor. Mirrors the Python {@code
 * DiscrepancyKind} enum in {@code contracts/ledger.py}.
 */
public enum DiscrepancyKind {
    TALLY,
    ARITHMETIC,
    CONSISTENCY,
    STATEMENT;

    @JsonValue
    public String toJson() {
        return name().toLowerCase();
    }
}
