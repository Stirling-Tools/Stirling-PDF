package stirling.software.proprietary.connectedaccount;

import java.io.IOException;

public class OAuthException extends IOException {

    private static final long serialVersionUID = 1L;

    private final boolean revoked;
    private final boolean consentRequired;

    public OAuthException(String message, boolean revoked, boolean consentRequired) {
        super(message);
        this.revoked = revoked;
        this.consentRequired = consentRequired;
    }

    public boolean isRevoked() {
        return revoked;
    }

    /**
     * The grant was refused because a requested scope was never consented to (Microsoft
     * AADSTS65001), not because the grant itself is gone.
     */
    public boolean isConsentRequired() {
        return consentRequired;
    }
}
