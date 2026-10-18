package stirling.software.proprietary.connectedaccount;

import java.io.IOException;

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
