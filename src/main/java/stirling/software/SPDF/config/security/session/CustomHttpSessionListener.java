package stirling.software.SPDF.config.security.session;

import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionListener;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class CustomHttpSessionListener implements HttpSessionListener {

    private SessionPersistentRegistry sessionPersistentRegistry;

    private final AtomicInteger activeSessions;

    @Autowired
    public CustomHttpSessionListener(SessionPersistentRegistry sessionPersistentRegistry) {
        super();
        this.sessionPersistentRegistry = sessionPersistentRegistry;
        activeSessions = new AtomicInteger();
    }

    @Override
    public void sessionCreated(HttpSessionEvent se) {
            log.info(
                    "Session created: {} with count {}",
                    se.getSession().getId(),
                    activeSessions.incrementAndGet());

    }

    @Override
    public void sessionDestroyed(HttpSessionEvent se) {
        log.info(
                "Session destroyed: {} with count {}",
                se.getSession().getId(),
                activeSessions.decrementAndGet());
        sessionPersistentRegistry.expireSession(se.getSession().getId());
    }
}
