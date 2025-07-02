package stirling.software.proprietary.security.filter;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import io.jsonwebtoken.JwtException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.AuthenticationServiceInterface;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JWTServiceInterface;

@Slf4j
@Component
@RequiredArgsConstructor
public class JWTAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    @Value("${security.jwt.enabled}")
    private boolean jwtEnabled;

    private final CustomUserDetailsService userDetailsService;
    private final JWTServiceInterface jwtService;
    private final AuthenticationServiceInterface authenticationService;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (shouldNotFilter(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        final String authHeader = request.getHeader("Authorization");
        String jwt = null;

        log.debug(
                "Processing JWT authentication for request: {} {}",
                request.getMethod(),
                request.getRequestURI());

        // Check for JWT in Authorization header
        if (authHeader != null && authHeader.startsWith(BEARER_PREFIX)) {
            jwt = authHeader.substring(BEARER_PREFIX.length());
            log.debug("Found JWT in Authorization header");
        } else {
            log.debug("No JWT in Authorization header, checking cookies");
            // Check for JWT in cookies
            Cookie[] cookies = request.getCookies();
            if (cookies != null) {
                log.debug("Found {} cookies", cookies.length);
                for (Cookie cookie : cookies) {
                    if ("jwt-token".equals(cookie.getName())) {
                        jwt = cookie.getValue();
                        log.debug("Found JWT token in cookie");
                        break;
                    }
                }
                if (jwt == null) {
                    log.debug("No jwt-token cookie found");
                }
            } else {
                log.debug("No cookies found in request");
            }
        }

        if (jwt != null) {
            log.debug(
                    "Found JWT token in request: {}",
                    jwt.substring(0, Math.min(20, jwt.length())) + "...");
            try {
                Authentication authentication =
                        SecurityContextHolder.getContext().getAuthentication();
                String username = jwtService.extractUsername(jwt);
                log.debug("Extracted username from JWT: {}", username);

                if (username != null && authentication == null) {
                    log.debug("No existing authentication, loading user details for: {}", username);
                    UserDetails userDetails = userDetailsService.loadUserByUsername(username);

                    if (jwtService.isTokenValid(jwt, userDetails)) {
                        log.debug("JWT token is valid for user: {}", username);
                        setAuthentication(request, userDetails);
                        log.debug("Successfully authenticated user via JWT: {}", username);
                    } else {
                        log.debug("Invalid JWT token for user: {}", username);
                        response.setStatus(HttpStatus.UNAUTHORIZED.value());
                        response.getWriter().write("Invalid or expired JWT token");
                        return;
                    }
                } else if (username != null) {
                    log.debug("User {} already authenticated, continuing", username);
                } else {
                    log.debug("Could not extract username from JWT token");
                }
            } catch (JwtException e) {
                log.debug("JWT authentication failed: {}", e.getMessage());
                response.setStatus(HttpStatus.UNAUTHORIZED.value());
                response.getWriter().write("Invalid JWT token");
                return;
            } catch (UsernameNotFoundException e) {
                log.debug("User not found: {}", e.getMessage());
                response.setStatus(HttpStatus.BAD_REQUEST.value());
                response.getWriter().write("User not found");
                return;
            }
        } else {

            String username = request.getParameter("username");

            if (username == null) {
                log.debug("Username not provided in request");
                filterChain.doFilter(request, response);
                return;
            }
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);

            if (authenticationService.verify(userDetails)) {
                log.debug("User {} authenticated successfully", userDetails.getUsername());
                setAuthentication(request, userDetails);
            } else {
                log.debug("User {} authentication failed", userDetails.getUsername());
                response.setStatus(HttpStatus.UNAUTHORIZED.value());
                response.getWriter().write("Invalid username or password");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private static void setAuthentication(HttpServletRequest request, UserDetails userDetails) {
        UsernamePasswordAuthenticationToken authenticationToken =
                new UsernamePasswordAuthenticationToken(
                        userDetails, null, userDetails.getAuthorities());
        authenticationToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authenticationToken);
    }
}
