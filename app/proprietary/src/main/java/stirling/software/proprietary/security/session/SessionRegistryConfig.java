package stirling.software.proprietary.security.session;

import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class SessionRegistryConfig {

    // MIGRATION: the @Produces SessionPersistentRegistry producer was removed. That class is
    // already an @ApplicationScoped CDI bean with an injectable constructor taking
    // SessionRepository,
    // so the producer was a second @Default bean of the same type and made every injection point
    // ambiguous. Quarkus auto-discovers the bean directly.
}
