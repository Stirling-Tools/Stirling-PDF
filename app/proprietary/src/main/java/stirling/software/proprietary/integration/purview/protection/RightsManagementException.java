package stirling.software.proprietary.integration.purview.protection;

import lombok.Getter;

@Getter
public class RightsManagementException extends RuntimeException {

    public static final String NO_PERMISSIONS = "no_permissions";
    public static final String ACCESS_DENIED = "access_denied";
    public static final String SIGN_IN_REQUIRED = "sign_in_required";
    public static final String NOT_PROTECTED = "not_protected";
    public static final String UNAVAILABLE = "unavailable";
    public static final String NETWORK = "network";
    public static final String FAILED = "failed";

    private final String code;
    private final String owner;

    public RightsManagementException(String code, String message) {
        this(code, message, null);
    }

    public RightsManagementException(String code, String message, String owner) {
        super(message);
        this.code = code;
        this.owner = owner == null || owner.isBlank() ? null : owner;
    }
}
