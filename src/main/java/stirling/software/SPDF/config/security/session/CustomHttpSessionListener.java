package stirling.software.SPDF.config.security.session;

import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionListener;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class CustomHttpSessionListener implements HttpSessionListener {

    private SessionPersistentRegistry sessionPersistentRegistry;

    public CustomHttpSessionListener(SessionPersistentRegistry sessionPersistentRegistry) {
        super();
        this.sessionPersistentRegistry = sessionPersistentRegistry;
    }

    @Override
    public void sessionCreated(HttpSessionEvent se) {}

    @Override
    public void sessionDestroyed(HttpSessionEvent se) {
        sessionPersistentRegistry.expireSession(se.getSession().getId());
    }
}
