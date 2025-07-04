package stirling.software.proprietary.security.filter;

import java.io.IOException;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;
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
        if (shouldNotFilter(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        String jwtToken = jwtService.extractTokenFromRequest(request);

        if (jwtToken == null) {
            // Special handling for root path - redirect to login instead of 401
            if ("/".equals(request.getRequestURI())
                    && "GET".equalsIgnoreCase(request.getMethod())) {
                response.sendRedirect("/login");
                return;
            }
            throw new AuthenticationFailureException("JWT is missing from request");
        }

        if (!jwtService.validateToken(jwtToken)) {
            throw new AuthenticationFailureException("JWT is invalid or expired");
        }

        String tokenUsername = jwtService.extractUsername(jwtToken);
        Authentication authentication = createAuthToken(request, tokenUsername);
        String jwt = jwtService.generateToken(authentication);

        jwtService.addTokenToResponse(response, jwt);

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
                SecurityContextHolder.getContext().setAuthentication(authToken);

                log.debug("JWT authentication successful for user: {}", username);

            } else {
                throw new UsernameNotFoundException("User not found: " + username);
            }
        }

        return SecurityContextHolder.getContext().getAuthentication();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String method = request.getMethod();

        // Always allow login POST requests to be processed
        if ("/login".equals(uri) && "POST".equalsIgnoreCase(method)) {
            return true;
        }

        String[] permitAllPatterns = {
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
            "/site.webmanifest",
            "/favicon"
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
}
