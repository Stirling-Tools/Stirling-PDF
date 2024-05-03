package stirling.software.SPDF.config.security;

import java.io.IOException;

import org.springframework.context.annotation.Bean;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.session.SessionRegistryImpl;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

public class CustomLogoutSuccessHandler extends SimpleUrlLogoutSuccessHandler {
    @Bean
    public SessionRegistry sessionRegistry() {
        return new SessionRegistryImpl();
    }

    @Override
    public void onLogoutSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException, ServletException {
        HttpSession session = request.getSession(false);
        if (session != null) {
            String sessionId = session.getId();
            sessionRegistry().removeSessionInformation(sessionId);
        }

        if (request.getParameter("oauth2AutoCreateDisabled") != null) {
            response.sendRedirect(
                    request.getContextPath() + "/login?error=oauth2AutoCreateDisabled");
        } else {
            response.sendRedirect(request.getContextPath() + "/login?logout=true");
        }
    }
}
