package stirling.software.proprietary.policy;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tells a caller whether a failure is new, so a condition that recurs on every poll or read is
 * logged loudly once rather than on every pass. Thread-safe. Holds one entry per key that is
 * currently failing; callers must {@link #recovered} a key once it succeeds again.
 */
public final class RepeatedFailureFilter {

    private final Map<String, String> failing = new ConcurrentHashMap<>();

    /**
     * True the first time {@code key} fails with {@code reason}, and again whenever the reason
     * changes; false while it keeps failing the same way.
     */
    public boolean isNew(String key, String reason) {
        String normalised = String.valueOf(reason);
        return !normalised.equals(failing.put(key, normalised));
    }

    public void recovered(String key) {
        failing.remove(key);
    }
}
