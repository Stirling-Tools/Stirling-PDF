package stirling.software.saas.store.moderation;

import java.util.List;

/**
 * A hosted content-moderation model that judges listing text in context and in any language. One
 * call per publish, edit or preflight, so latency matters little and a free endpoint is enough.
 */
public interface StoreModeration {

    /** One verdict per text, in the order given. */
    List<Verdict> check(List<String> texts) throws UnavailableException;

    /** The provider's name, for logs. */
    String name();

    /**
     * Whether the text is flagged and, if so, the provider's category in plain words ("hate",
     * "sexual", "self harm"). Never the text itself.
     */
    record Verdict(boolean flagged, String category) {
        public static final Verdict CLEAN = new Verdict(false, null);
    }

    /** The provider could not answer: down, slow, out of quota or misconfigured. */
    class UnavailableException extends Exception {
        public UnavailableException(String message, Throwable cause) {
            super(message, cause);
        }

        public UnavailableException(String message) {
            super(message);
        }
    }
}
