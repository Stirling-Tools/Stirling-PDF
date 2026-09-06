package stirling.software.proprietary.security.util;

/**
 * The one password rule every path that sets a password enforces: account creation, invite
 * redemption, self-service change and administrator reset. Public endpoints such as invite
 * acceptance are the reason it lives server-side - a client-side minimum is a hint, not a policy.
 */
public final class PasswordPolicy {

    /** NIST SP 800-63B's floor for a user-chosen secret. */
    public static final int MIN_LENGTH = 8;

    public static final String VIOLATION_MESSAGE =
            "Password must be at least " + MIN_LENGTH + " characters.";

    private PasswordPolicy() {}

    /** Whether {@code password} may be stored. Whitespace counts, but an all-space secret does not. */
    public static boolean isAcceptable(String password) {
        return password != null && !password.isBlank() && password.length() >= MIN_LENGTH;
    }
}
