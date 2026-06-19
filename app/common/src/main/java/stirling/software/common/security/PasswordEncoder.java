package stirling.software.common.security;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.crypto.password.PasswordEncoder}.
 *
 * <p>Service interface for encoding passwords.
 */
public interface PasswordEncoder {

    /** Encodes the raw password. */
    String encode(CharSequence rawPassword);

    /** Verifies that the encoded password matches the raw password after it too is encoded. */
    boolean matches(CharSequence rawPassword, String encodedPassword);
}
