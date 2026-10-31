package stirling.software.proprietary.security.session;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.session.SessionRegistryImpl;

import stirling.software.proprietary.security.database.repository.SessionRepository;

@Configuration
public class SessionRegistryConfig {

    @Bean
    public SessionRegistryImpl sessionRegistry() {
        return new SessionRegistryImpl();
    }

    /** Resolves the expiry sweep lazily to avoid a construction cycle back to this registry. */
    @Bean
    public SessionPersistentRegistry sessionPersistentRegistry(
            SessionRepository sessionRepository,
            ObjectProvider<SessionScheduled> sessionScheduled) {
        return new SessionPersistentRegistry(
                sessionRepository,
                () -> {
                    SessionScheduled scheduled = sessionScheduled.getIfAvailable();
                    if (scheduled == null || !scheduled.ensureScheduled()) {
                        throw new IllegalStateException(
                                "session expiry scheduler is not available");
                    }
                });
    }
}
