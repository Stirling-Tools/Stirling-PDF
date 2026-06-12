package stirling.software.proprietary.security.configuration;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Standalone {@link PasswordEncoder} producer.
 *
 * <p>TODO: Migration required - spring-security-crypto is no longer on the Quarkus classpath. The
 * {@link PasswordEncoder} / {@link BCryptPasswordEncoder} types must be replaced. Options: add a
 * BCrypt library (e.g. at.favre.lib:bcrypt or org.mindrot:jbcrypt) and produce a thin local
 * PasswordEncoder abstraction, or use io.quarkus.elytron.security.common.BcryptUtil. The
 * org.springframework.security imports below are retained only so the bean shape/return type stays
 * intact for the consuming services (UserService, SecurityConfiguration) until the encoder
 * abstraction is ported across all three files together.
 */
@ApplicationScoped
public class PasswordEncoderConfig {

    @Produces
    @ApplicationScoped
    public PasswordEncoder passwordEncoder() {
        // TODO: Migration required - replace BCryptPasswordEncoder once a Quarkus-compatible
        // BCrypt implementation is wired in (see class-level note).
        return new BCryptPasswordEncoder();
    }
}
