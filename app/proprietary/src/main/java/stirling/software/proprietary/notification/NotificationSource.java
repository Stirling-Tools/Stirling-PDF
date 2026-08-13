package stirling.software.proprietary.notification;

import java.util.Arrays;
import java.util.Locale;
import java.util.Optional;

/**
 * Which subsystem produced a notification. One member today; the point of the field is that a
 * client already branches on it, so a second source needs no client change to be ignorable.
 *
 * <p>Also the routing table for a notification id: every id is prefixed with its source, so an id
 * handed back to a notification endpoint says which subsystem to ask, and a client never holds the
 * producing row's own id.
 */
public enum NotificationSource {

    /** A recorded run failure: see {@code stirling.software.proprietary.failure}. */
    FAILURE;

    private static final char SEPARATOR = ':';

    /** The prefix an id from this source carries, including the separator. */
    public String prefix() {
        return name().toLowerCase(Locale.ROOT) + SEPARATOR;
    }

    /** One of this source's own row ids, as the client sees it. */
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
