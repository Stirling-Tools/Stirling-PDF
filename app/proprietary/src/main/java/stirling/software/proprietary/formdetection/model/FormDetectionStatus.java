package stirling.software.proprietary.formdetection.model;

import java.util.Locale;

/** Lifecycle state of the Auto Form Detection model install. */
public enum FormDetectionStatus {
    NOT_INSTALLED,
    DOWNLOADING,
    VERIFYING,
    READY,
    FAILED;

    /** Lowercase wire form sent to the frontend, e.g. {@code not_installed}. */
    public String wire() {
        return name().toLowerCase(Locale.ROOT);
    }
}
