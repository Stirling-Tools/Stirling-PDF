package stirling.software.SPDF.service.xfa;

import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonValue;

import stirling.software.common.util.ExceptionUtils;

/** What saving a hybrid AcroForm + XFA form does to its XFA packet. */
public enum XfaMode {
    /** Rewrite the XFA data so Acrobat shows the same values as every other viewer. */
    SYNC,
    /** Remove the XFA packet so every viewer, Acrobat included, renders the AcroForm fields. */
    STRIP,
    /** Leave the XFA packet and the Reader usage rights exactly as they are. */
    NONE;

    /**
     * Reads the {@code xfaMode} request value case-insensitively; a missing value means {@link
     * #SYNC}.
     *
     * @throws IllegalArgumentException for any other value
     */
    public static XfaMode fromParam(String raw) {
        if (raw == null || raw.isBlank()) {
            return SYNC;
        }
        String wanted = raw.trim();
        for (XfaMode mode : values()) {
            if (mode.name().equalsIgnoreCase(wanted)) {
                return mode;
            }
        }
        throw ExceptionUtils.createIllegalArgumentException(
                "error.invalidArgument", "{0}", "xfaMode must be sync, strip or none");
    }

    @JsonValue
    public String param() {
        return name().toLowerCase(Locale.ROOT);
    }
}
