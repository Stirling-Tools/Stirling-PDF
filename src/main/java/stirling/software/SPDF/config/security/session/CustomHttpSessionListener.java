package stirling.software.SPDF.config.security.session;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpSessionEvent;
import jakarta.servlet.http.HttpSessionListener;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.security.UserUtils;

@Component
@Slf4j
public class CustomHttpSessionListener implements HttpSessionListener {

    private final SessionPersistentRegistry sessionPersistentRegistry;

    public CustomHttpSessionListener(SessionPersistentRegistry sessionPersistentRegistry) {
        super();
        this.sessionPersistentRegistry = sessionPersistentRegistry;
    }

    @Override
    public void sessionCreated(HttpSessionEvent se) {
        SecurityContext securityContext = SecurityContextHolder.getContext();
        if (securityContext == null) {
            log.debug("Security context is null");
            return;
        }
        Authentication authentication = securityContext.getAuthentication();
        if (authentication == null) {
            log.info("Authentication is null");
            return;
        }
        Object principal = authentication.getPrincipal();
        if (principal == null) {
            log.info("Principal is null");
            return;
        }
        String principalName = UserUtils.getUsernameFromPrincipal(principal);
        if (principalName == null || "anonymousUser".equals(principalName)) {
            return;
        }
        log.info("Session created: {}", principalName);
        sessionPersistentRegistry.registerNewSession(se.getSession().getId(), principalName);
    }

    @Override
    public void sessionDestroyed(HttpSessionEvent se) {
        sessionPersistentRegistry.expireSession(se.getSession().getId());
    }
}
