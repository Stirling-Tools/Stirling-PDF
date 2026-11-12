package stirling.software.proprietary.connectedaccount;

import java.io.IOException;

public class AccountReconnectRequiredException extends IOException {

    private static final long serialVersionUID = 1L;

    public AccountReconnectRequiredException(String message) {
        super(message);
    }
}
