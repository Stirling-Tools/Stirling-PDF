package stirling.software.proprietary.storage.egress;

import java.util.Locale;

/** How a document is leaving. Ids are persisted in a policy's {@code sources}. */
public enum ShareChannel {

    /** Shared directly with another registered user of this deployment. */
    USER_SHARE("userShare"),

    /** A token share link was minted; anyone holding it can open the document. */
    SHARE_LINK("shareLink"),

    /** Shared to an email address, which mails a link to a recipient who may have no account. */
    EMAIL_SHARE("emailShare");

    private final String id;

    ShareChannel(String id) {
        this.id = id;
    }

    public String id() {
        return id;
    }

    /** The channel for a stored id, or null when the id names something else (e.g. "editor"). */
    public static ShareChannel fromId(String id) {
        if (id == null) {
            return null;
        }
        String normalized = id.trim().toLowerCase(Locale.ROOT);
        for (ShareChannel channel : values()) {
            if (channel.id.toLowerCase(Locale.ROOT).equals(normalized)) {
                return channel;
            }
        }
        return null;
    }
}
