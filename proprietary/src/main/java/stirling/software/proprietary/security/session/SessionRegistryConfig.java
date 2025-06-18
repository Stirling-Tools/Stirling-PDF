package stirling.software.proprietary.security.session;

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

    @Bean
    public SessionPersistentRegistry sessionPersistentRegistry(
            SessionRepository sessionRepository) {
        return new SessionPersistentRegistry(sessionRepository);
    }
}
