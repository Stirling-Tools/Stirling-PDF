package stirling.software.SPDF.config.security;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

public class CustomLogoutSuccessHandler extends SimpleUrlLogoutSuccessHandler {

    @Autowired SessionRegistry sessionRegistry;

    @Override
    public void onLogoutSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException, ServletException {
        HttpSession session = request.getSession(false);
        if (session != null) {
            String sessionId = session.getId();
            sessionRegistry.removeSessionInformation(sessionId);
            session.invalidate();
            logger.debug("Session invalidated: " + sessionId);
        }

        response.sendRedirect(request.getContextPath() + "/login?logout=true");
    }
}
