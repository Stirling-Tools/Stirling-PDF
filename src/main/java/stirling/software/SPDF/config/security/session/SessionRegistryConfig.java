package stirling.software.SPDF.config.security.session;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.session.SessionRegistryImpl;

@Configuration
public class SessionRegistryConfig {

    @Bean
    public SessionRegistryImpl sessionRegistry() {
        return new SessionRegistryImpl();
    }

    @Bean
    public SessionPersistentRegistry sessionPersistentRegistry(
            SessionRepository sessionRepository,
            @Qualifier("runningEE") boolean runningEE,
            @Qualifier("loginEnabled") boolean loginEnabled) {
        return new SessionPersistentRegistry(sessionRepository, runningEE, loginEnabled);
    }
}
