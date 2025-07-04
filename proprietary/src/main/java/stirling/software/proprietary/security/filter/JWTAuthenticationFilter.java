package stirling.software.proprietary.security.filter;

import java.io.IOException;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JWTServiceInterface;

@Slf4j
@Component
@ConditionalOnBooleanProperty("security.jwt.enabled")
public class JWTAuthenticationFilter extends OncePerRequestFilter {

    private final JWTServiceInterface jwtService;
    private final CustomUserDetailsService userDetailsService;

    public JWTAuthenticationFilter(
            JWTServiceInterface jwtService, CustomUserDetailsService userDetailsService) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (!jwtService.isJwtEnabled()) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            if (shouldNotFilter(request)) {
                filterChain.doFilter(request, response);
                return;
            }

            String jwtToken = jwtService.extractTokenFromRequest(request);

            if (jwtToken == null) {
                sendUnauthorizedResponse(response, "JWT token is missing");
                return;
            }

            if (!jwtService.validateToken(jwtToken)) {
                sendUnauthorizedResponse(response, "JWT token is invalid or expired");
                return;
            }

            String username = jwtService.extractUsername(jwtToken);
            Authentication authentication = createAuthToken(request, username);
            String jwt = jwtService.generateToken(authentication);

            jwtService.addTokenToResponse(response, jwt);
        } catch (Exception e) {
            log.error(
                    "JWT authentication failed for request: {} {}",
                    request.getMethod(),
                    request.getRequestURI(),
                    e);

            // Determine specific error message based on exception type
            String errorMessage = "JWT authentication failed";
            if (e.getMessage() != null && e.getMessage().contains("expired")) {
                errorMessage = "JWT token has expired";
            } else if (e.getMessage() != null && e.getMessage().contains("signature")) {
                errorMessage = "JWT token signature is invalid";
            } else if (e.getMessage() != null && e.getMessage().contains("malformed")) {
                errorMessage = "JWT token is malformed";
            }

            sendUnauthorizedResponse(response, errorMessage);
            return;
        }

        filterChain.doFilter(request, response);
    }

    private Authentication createAuthToken(HttpServletRequest request, String username) {
        if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);

            if (userDetails != null) {
                UsernamePasswordAuthenticationToken authToken =
                        new UsernamePasswordAuthenticationToken(
                                userDetails, null, userDetails.getAuthorities());

                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                // Set authentication in SecurityContext
                SecurityContextHolder.getContext().setAuthentication(authToken);
                log.debug("JWT authentication successful for user: {}", username);

                return SecurityContextHolder.getContext().getAuthentication();
            }
        }

        return null;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contextPath = request.getContextPath();

        String[] permitAllPatterns = {
            "/",
            "/login",
            "/register",
            "/error",
            "/images/",
            "/public/",
            "/css/",
            "/fonts/",
            "/js/",
            "/pdfjs/",
            "/pdfjs-legacy/",
            "/api/v1/info/status",
            "/site.webmanifest"
        };

        for (String pattern : permitAllPatterns) {
            if (uri.startsWith(pattern)
                    || uri.endsWith(".svg")
                    || uri.endsWith(".png")
                    || uri.endsWith(".ico")) {
                return true;
            }
        }

        return false;
    }

    private void sendUnauthorizedResponse(HttpServletResponse response, String message)
            throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");

        String jsonResponse =
                String.format(
                        """
                        {
                          "error": "Unauthorized",
                          "mesaage": %s,
                          "status": 401
                        }
                        """,
                        message);

        response.getWriter().write(jsonResponse);
        response.getWriter().flush();
    }
}
