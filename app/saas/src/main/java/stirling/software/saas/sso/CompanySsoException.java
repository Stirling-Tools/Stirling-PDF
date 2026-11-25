package stirling.software.saas.sso;

import java.util.UUID;

import lombok.Getter;

/** Public, non-secret failure details shared by the SSO endpoints and authentication filter. */
@Getter
public class CompanySsoException extends RuntimeException {
    private final String code;
    private final UUID connectionId;

    public CompanySsoException(String code, String message) {
        this(code, message, null);
    }

    public CompanySsoException(String code, String message, UUID connectionId) {
        super(message);
        this.code = code;
        this.connectionId = connectionId;
    }
}
