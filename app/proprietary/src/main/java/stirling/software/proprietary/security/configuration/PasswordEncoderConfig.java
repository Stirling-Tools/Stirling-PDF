package stirling.software.proprietary.security.configuration;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

import stirling.software.common.security.BCryptPasswordEncoder;
import stirling.software.common.security.PasswordEncoder;

/**
 * Standalone {@link PasswordEncoder} producer.
 *
 * <p>Migrated off spring-security-crypto: the {@link PasswordEncoder} / {@link
 * BCryptPasswordEncoder} types now resolve to the compat shims in
 * stirling.software.common.security, keeping the bean shape/return type intact for the consuming
 * services (UserService, SecurityConfiguration).
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
