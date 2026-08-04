package stirling.software.common.security;

import at.favre.lib.crypto.bcrypt.BCrypt;

/**
 * Migration compatibility shim for {@code
 * org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder}.
 *
 * <p>Implementation of {@link PasswordEncoder} backed by the {@code at.favre.lib:bcrypt} library.
 */
public class BCryptPasswordEncoder implements PasswordEncoder {

    private static final int DEFAULT_STRENGTH = 10;

    private final int strength;

    public BCryptPasswordEncoder() {
        this(DEFAULT_STRENGTH);
    }

    public BCryptPasswordEncoder(int strength) {
        this.strength = strength;
    }

    @Override
    public String encode(CharSequence rawPassword) {
        if (rawPassword == null) {
            throw new IllegalArgumentException("rawPassword cannot be null");
        }
        return BCrypt.withDefaults().hashToString(strength, rawPassword.toString().toCharArray());
    }

    @Override
    public boolean matches(CharSequence rawPassword, String encodedPassword) {
        if (rawPassword == null) {
            throw new IllegalArgumentException("rawPassword cannot be null");
        }
        if (encodedPassword == null || encodedPassword.isEmpty()) {
            return false;
        }
        return BCrypt.verifyer()
                .verify(rawPassword.toString().toCharArray(), encodedPassword)
                .verified;
    }
}
