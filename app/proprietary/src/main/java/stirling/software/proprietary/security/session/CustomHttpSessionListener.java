package stirling.software.proprietary.security.session;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionListener;

import lombok.extern.slf4j.Slf4j;

@ApplicationScoped
@Slf4j
public class CustomHttpSessionListener implements HttpSessionListener {

    private final SessionPersistentRegistry sessionPersistentRegistry;

    @Inject
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
