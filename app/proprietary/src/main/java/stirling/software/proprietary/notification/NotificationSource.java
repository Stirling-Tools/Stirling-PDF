package stirling.software.proprietary.notification;

import java.util.Locale;

/**
 * Which subsystem produced a notification. One member today; the point of the field is that a
 * client already branches on it, so a second source needs no client change to be ignorable.
 *
 * <p>Every notification id is prefixed with its source, so a client never holds the producing row's
 * own id and cannot hand it to that source's endpoints by accident.
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
}
