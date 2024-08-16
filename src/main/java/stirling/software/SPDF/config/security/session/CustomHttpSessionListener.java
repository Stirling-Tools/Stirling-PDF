package stirling.software.SPDF.config.security.session;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionListener;
import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class CustomHttpSessionListener implements HttpSessionListener {

    @Autowired private SessionPersistentRegistry sessionPersistentRegistry;

    @Override
    public void sessionCreated(HttpSessionEvent se) {
        log.info("Session created: " + se.getSession().getId());
    }

    @Override
    public void sessionDestroyed(HttpSessionEvent se) {
        log.info("Session destroyed: " + se.getSession().getId());
        sessionPersistentRegistry.expireSession(se.getSession().getId());
    }
}
