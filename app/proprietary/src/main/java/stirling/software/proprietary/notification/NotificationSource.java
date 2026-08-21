package stirling.software.proprietary.notification;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

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

    /**
     * The source a notification id belongs to, and the row id within it. Empty rather than throwing
     * for an unprefixed id or an unknown source, since both arrive from clients.
     */
    public static Optional<QualifiedId> parse(String notificationId) {
        if (notificationId == null) {
            return Optional.empty();
        }
        int separator = notificationId.indexOf(SEPARATOR);
        if (separator <= 0 || separator == notificationId.length() - 1) {
            return Optional.empty();
        }
        String prefix = notificationId.substring(0, separator);
        String rowId = notificationId.substring(separator + 1);
        return Arrays.stream(values())
                .filter(source -> source.name().equalsIgnoreCase(prefix))
                .findFirst()
                .map(source -> new QualifiedId(source, rowId));
    }

    /** A notification id split into the source that owns it and that source's own row id. */
    public record QualifiedId(NotificationSource source, String rowId) {}
}
