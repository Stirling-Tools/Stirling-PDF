package stirling.software.proprietary.connectedaccount;

import java.io.IOException;

/** A connected account's grant no longer works; only its owner signing in again fixes it. */
public class AccountReconnectRequiredException extends IOException {

    private static final long serialVersionUID = 1L;

    public AccountReconnectRequiredException(String message) {
        super(message);
    }
}
