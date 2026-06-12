package stirling.software.proprietary.security.session;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

import stirling.software.proprietary.security.database.repository.SessionRepository;

@ApplicationScoped
public class SessionRegistryConfig {

    // TODO: Migration required - SessionRegistryImpl is a Spring Security type
    // (org.springframework.security.core.session.SessionRegistryImpl) with no Quarkus
    // equivalent. Concurrent-session tracking must be rehosted (e.g. a custom bean backed
    // by SessionPersistentRegistry / SecurityIdentity, or quarkus session management).
    // The original producer was:
    //   @Bean public SessionRegistryImpl sessionRegistry() { return new SessionRegistryImpl(); }

    // Note: SessionPersistentRegistry is a local CDI bean (@ApplicationScoped) and is
    // auto-discovered by Quarkus, so an explicit producer is no longer required. A producer
    // is kept here only to preserve the explicit construction with SessionRepository; remove
    // it if SessionPersistentRegistry is annotated as a CDI bean to avoid an ambiguous bean.
    @Produces
    @ApplicationScoped
    public SessionPersistentRegistry sessionPersistentRegistry(
            SessionRepository sessionRepository) {
        return new SessionPersistentRegistry(sessionRepository);
    }
}
