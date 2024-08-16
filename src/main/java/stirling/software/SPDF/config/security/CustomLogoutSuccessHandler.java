package stirling.software.SPDF.config.security;

import java.io.IOException;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.logout.SimpleUrlLogoutSuccessHandler;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public class CustomLogoutSuccessHandler extends SimpleUrlLogoutSuccessHandler {

    @Override
    public void onLogoutSuccess(
            HttpServletRequest request, HttpServletResponse response, Authentication authentication)
            throws IOException, ServletException {

        if (request.getParameter("userIsDisabled") != null) {
            getRedirectStrategy()
                    .sendRedirect(request, response, "/login?erroroauth=userIsDisabled");
            return;
        }

        getRedirectStrategy().sendRedirect(request, response, "/login?logout=true");
    }
}
