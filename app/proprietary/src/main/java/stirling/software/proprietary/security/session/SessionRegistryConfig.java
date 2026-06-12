package stirling.software.proprietary.security.session;

import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class SessionRegistryConfig {

    // TODO: Migration required - SessionRegistryImpl is a Spring Security type
    // (org.springframework.security.core.session.SessionRegistryImpl) with no Quarkus
    // equivalent. Concurrent-session tracking must be rehosted (e.g. a custom bean backed
    // by SessionPersistentRegistry / SecurityIdentity, or quarkus session management).
    // The original producer was:
    //   @Bean public SessionRegistryImpl sessionRegistry() { return new SessionRegistryImpl(); }

    // MIGRATION: the @Produces SessionPersistentRegistry producer was removed. That class is
    // already an @ApplicationScoped CDI bean with an injectable constructor taking
    // SessionRepository,
    // so the producer was a second @Default bean of the same type and made every injection point
    // ambiguous. Quarkus auto-discovers the bean directly.
}
