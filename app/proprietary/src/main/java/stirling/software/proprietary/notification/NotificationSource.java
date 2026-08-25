package stirling.software.proprietary.notification;

import java.util.Locale;

/**
 * Which subsystem produced a notification. Every id is prefixed with it, so a client never holds
 * the producing row's own id and cannot reach that source's endpoints by accident.
 */
public enum NotificationSource {
    FAILURE;

    private static final char SEPARATOR = ':';

    public String prefix() {
        return name().toLowerCase(Locale.ROOT) + SEPARATOR;
    }

    public String qualify(String sourceRowId) {
        return prefix() + sourceRowId;
    }
}
