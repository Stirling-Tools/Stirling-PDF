package stirling.software.proprietary.connectedaccount;

import java.io.IOException;

/**
 * A provider refused a token request. {@link #isRevoked()} means the stored grant is no longer
 * usable (revoked, expired, password changed) and only the user signing in again fixes it.
 */
public class OAuthException extends IOException {

    private static final long serialVersionUID = 1L;

    private final boolean revoked;

    public OAuthException(String message, boolean revoked) {
        super(message);
        this.revoked = revoked;
    }

    public boolean isRevoked() {
        return revoked;
    }
}
