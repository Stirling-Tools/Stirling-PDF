package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.proprietary.security.JwtAuthenticationEntryPoint;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.UserService;

/**
 * MIGRATION (Spring -> Quarkus): {@code JwtAuthenticationFilter} is now a plain {@code
 * jakarta.servlet.Filter} (entry point {@code doFilter(...)}, was Spring's {@code
 * OncePerRequestFilter#doFilterInternal}). Its behaviour changed with the migration and these tests
 * pin the CURRENT behaviour:
 *
 * <ul>
 *   <li>{@code loadUserByUsername} returns the {@code User} entity (the Spring {@code
 *       UserDetailsService}/{@code UserDetails} contract was dropped); the authenticated principal
 *       is stored in the {@code stirling.software.common.security.SecurityContextHolder}
 *       thread-local shim using a {@code UsernamePasswordAuthenticationToken} shim.
 *   <li>A missing JWT on an {@code /api/} path returns a 401 JSON body; on a non-API (SPA) route it
 *       falls through to the chain so React Router can serve {@code index.html} (no redirect to
 *       {@code /login} - that Spring behaviour is gone).
 *   <li>Validation failures are shaped by the {@code JwtAuthenticationEntryPoint} bean's {@code
 *       commence(...)} (was Spring Security's {@code AuthenticationEntryPoint}).
 *   <li>There is no per-request token rotation, so {@code generateToken} is no longer invoked here.
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

    @Mock private JwtServiceInterface jwtService;
    @Mock private CustomUserDetailsService userDetailsService;
    @Mock private UserService userService;
    @Mock private ApplicationProperties.Security securityProperties;
    @Mock private HttpServletRequest request;
    @Mock private HttpServletResponse response;
    @Mock private FilterChain filterChain;
    @Mock private JwtAuthenticationEntryPoint authenticationEntryPoint;

    @InjectMocks private JwtAuthenticationFilter jwtAuthenticationFilter;

    @AfterEach
    void clearSecurityContext() {
        // The filter writes the authenticated principal into a thread-local; clear it so state does
        // not leak between tests.
        SecurityContextHolder.clearContext();
    }

    @Test
    void shouldNotAuthenticateWhenJwtDisabled() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(false);

        jwtAuthenticationFilter.doFilter(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(jwtService, never()).extractToken(any());
    }

    @Test
    void authenticatesAndPopulatesSecurityContextForValidToken()
            throws ServletException, IOException {
        String token = "valid-jwt-token";
        String username = "testuser";
        Map<String, Object> claims = Map.of("sub", username, "authType", "WEB");
        User user = new User();
        user.setUsername(username);

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getContextPath()).thenReturn("");
        when(request.getRequestURI()).thenReturn("/protected");
        when(jwtService.extractToken(request)).thenReturn(token);
        doNothing().when(jwtService).validateToken(token);
        when(jwtService.extractClaims(token)).thenReturn(claims);
        when(userDetailsService.loadUserByUsername(username)).thenReturn(user);

        jwtAuthenticationFilter.doFilter(request, response, filterChain);

        verify(jwtService).validateToken(token);
        verify(jwtService).extractClaims(token);
        verify(userDetailsService).loadUserByUsername(username);
        verify(filterChain).doFilter(request, response);

        // The validated user is now the authenticated principal in the thread-local context.
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        assertSame(user, authentication.getPrincipal());
    }

    @Test
    void missingTokenOnApiPathReturns401Json() throws ServletException, IOException {
        StringWriter body = new StringWriter();
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/api/v1/general/rotate-pdf");
        when(request.getContextPath()).thenReturn("");
        when(jwtService.extractToken(request)).thenReturn(null);
        when(response.getWriter()).thenReturn(new PrintWriter(body));

        jwtAuthenticationFilter.doFilter(request, response, filterChain);

        verify(response).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void missingTokenOnSpaRouteFallsThroughToChain() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getContextPath()).thenReturn("");
        when(jwtService.extractToken(request)).thenReturn(null);

        jwtAuthenticationFilter.doFilter(request, response, filterChain);

        // SPA routes are served by React Router; the filter must not 401 them.
        verify(filterChain).doFilter(request, response);
        verify(response, never()).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
    }

    @Test
    void validationFailureIsHandedToTheEntryPoint() throws ServletException, IOException {
        String token = "invalid-jwt-token";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getContextPath()).thenReturn("");
        when(jwtService.extractToken(request)).thenReturn(token);
        doThrow(new AuthenticationFailureException("Invalid token"))
                .when(jwtService)
                .validateToken(token);

        jwtAuthenticationFilter.doFilter(request, response, filterChain);

        verify(jwtService).validateToken(token);
        verify(authenticationEntryPoint)
                .commence(eq(request), eq(response), any(AuthenticationFailureException.class));
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void expiredTokenIsHandedToTheEntryPoint() throws ServletException, IOException {
        String token = "expired-jwt-token";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getContextPath()).thenReturn("");
        when(jwtService.extractToken(request)).thenReturn(token);
        doThrow(new AuthenticationFailureException("The token has expired"))
                .when(jwtService)
                .validateToken(token);

        jwtAuthenticationFilter.doFilter(request, response, filterChain);

        verify(jwtService).validateToken(token);
        verify(authenticationEntryPoint).commence(eq(request), eq(response), any());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void throwsWhenUserNotFound() throws Exception {
        String token = "valid-jwt-token";
        String username = "nonexistentuser";
        Map<String, Object> claims = Map.of("sub", username, "authType", "WEB");

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getContextPath()).thenReturn("");
        when(jwtService.extractToken(request)).thenReturn(token);
        // validateToken returns normally; lenient so the throw assertion does not flag it unused.
        lenient().doNothing().when(jwtService).validateToken(token);
        when(jwtService.extractClaims(token)).thenReturn(claims);
        when(userDetailsService.loadUserByUsername(username)).thenReturn(null);

        stirling.software.common.security.UsernameNotFoundException ex =
                assertThrows(
                        stirling.software.common.security.UsernameNotFoundException.class,
                        () -> jwtAuthenticationFilter.doFilter(request, response, filterChain));

        assertEquals("User not found: " + username, ex.getMessage());
        verify(userDetailsService).loadUserByUsername(username);
        verify(filterChain, never()).doFilter(request, response);
    }
}
