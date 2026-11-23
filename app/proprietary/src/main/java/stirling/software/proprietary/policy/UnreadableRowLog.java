package stirling.software.proprietary.policy;

import java.util.Objects;

import org.slf4j.Logger;

/**
 * Reports stored policy/source rows that cannot be read. Stores read every row on each list call,
 * so one bad row is logged at ERROR once and at DEBUG on later reads, until it becomes readable or
 * its stored value changes.
 */
public final class UnreadableRowLog {

    private final Logger log;
    private final String rowKind;
    private final RepeatedFailureFilter repeats = new RepeatedFailureFilter();

    public UnreadableRowLog(Logger log, String rowKind) {
        this.log = log;
        this.rowKind = rowKind;
    }

    public void skipped(String id, String name, String stored, Exception cause) {
        String problem = describe(stored, cause);
        if (repeats.isNew(id, Integer.toString(Objects.hashCode(stored)))) {
            log.error("Skipping unreadable {} id={} name={}: {}", rowKind, id, name, problem);
        } else {
            log.debug("Still skipping unreadable {} id={}: {}", rowKind, id, problem);
        }
    }

    public void readable(String id) {
        repeats.recovered(id);
    }

    // LegacyDecryptStringConverter hands back ciphertext it cannot decrypt unchanged, and plaintext
    // JSON always opens with '{', so anything else is ciphertext from another installation's key.
    private static String describe(String stored, Exception cause) {
        if (stored == null) {
            return "no stored JSON";
        }
        if (!stored.stripLeading().startsWith("{")) {
            return "stored value is encrypted with a key this server does not hold";
        }
        return "stored JSON could not be parsed ("
                + cause.getMessage()
                + "). Likely written by a different app version.";
    }
}
