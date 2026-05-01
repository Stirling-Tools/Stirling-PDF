package stirling.software.proprietary.model.api.ai.contradiction;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Polarity of a {@link Claim} extracted by the Contradiction Agent.
 *
 * <p>Java counterpart: the {@code polarity} {@code Literal} in {@code Claim} in {@code
 * contracts/contradiction.py} — values must stay in sync. Adding a new polarity is a coordinated
 * cross-language change: Python's {@code Literal} rejects unknown values on parse, and so does this
 * enum (via {@link #fromJson}). Old clients carrying a verdict with a new polarity through a resume
 * artifact will fail validation early — that is the intended behaviour, so failures surface at the
 * boundary instead of silently drifting.
 */
public enum ClaimPolarity {
    ASSERT,
    DENY,
    RECOMMEND,
    REJECT,
    NEUTRAL;

    @JsonValue
    public String toJson() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static ClaimPolarity fromJson(String value) {
        if (value == null) {
            throw new IllegalArgumentException("ClaimPolarity value cannot be null");
        }
        return ClaimPolarity.valueOf(value.toUpperCase());
    }
}
