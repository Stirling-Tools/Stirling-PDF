package stirling.software.SPDF.config.security;

import java.io.IOException;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.utils.RequestUriUtils;

@Component
public class FirstLoginFilter extends OncePerRequestFilter {

    @Autowired @Lazy private UserService userService;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String method = request.getMethod();
        String requestURI = request.getRequestURI();
        // Check if the request is for static resources
        boolean isStaticResource = RequestUriUtils.isStaticResource(requestURI);

        // If it's a static resource, just continue the filter chain and skip the logic below
        if (isStaticResource) {
            filterChain.doFilter(request, response);
            return;
        }

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()) {
            Optional<User> user = userService.findByUsernameIgnoreCase(authentication.getName());
            if ("GET".equalsIgnoreCase(method)
                    && user.isPresent()
                    && user.get().isFirstLogin()
                    && !"/change-creds".equals(requestURI)) {
                response.sendRedirect("/change-creds");
                return;
            }
        }
        filterChain.doFilter(request, response);
    }
}
