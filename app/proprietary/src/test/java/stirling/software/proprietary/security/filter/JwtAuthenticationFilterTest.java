package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.sql.SQLException;
import java.util.Collections;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.AuthenticationEntryPoint;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.UserService;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

    @Mock private JwtServiceInterface jwtService;

    @Mock private UserService userService;

    @Mock private CustomUserDetailsService userDetailsService;

    @Mock private HttpServletRequest request;

    @Mock private HttpServletResponse response;

    @Mock private FilterChain filterChain;

    @Mock private UserDetails userDetails;

    @Mock private AuthenticationEntryPoint authenticationEntryPoint;

    private JwtAuthenticationFilter jwtAuthenticationFilter;
    private ApplicationProperties.Security securityProperties;

    @BeforeEach
    void setUp() {
        securityProperties = new ApplicationProperties.Security();
        jwtAuthenticationFilter =
                new JwtAuthenticationFilter(
                        jwtService,
                        userService,
                        userDetailsService,
                        authenticationEntryPoint,
                        securityProperties);
        SecurityContextHolder.setContext(new SecurityContextImpl());
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void shouldNotAuthenticateWhenJwtDisabled() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(false);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(jwtService, never()).extractToken(any(HttpServletRequest.class));
    }

    @Test
    void shouldNotFilterWhenPageIsLogin() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/login");
        when(request.getContextPath()).thenReturn("");

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(jwtService, never()).extractToken(any(HttpServletRequest.class));
    }

    @Test
    void shouldAuthenticateUserWithValidToken() throws ServletException, IOException {
        String token = "valid-jwt-token";
        String username = "testuser";
        Map<String, Object> claims = Map.of("sub", username, "authType", "WEB");

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getContextPath()).thenReturn("");
        when(request.getRequestURI()).thenReturn("/protected");
        when(jwtService.extractToken(request)).thenReturn(token);
        when(jwtService.extractClaims(token)).thenReturn(claims);
        when(userDetails.getAuthorities()).thenReturn(Collections.emptyList());
        when(userDetailsService.loadUserByUsername(username)).thenReturn(userDetails);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(jwtService).validateToken(token);
        verify(jwtService).extractClaims(token);
        verify(userDetailsService).loadUserByUsername(username);

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        assertNotNull(authentication);
        assertTrue(authentication instanceof UsernamePasswordAuthenticationToken);
        assertEquals(userDetails, authentication.getPrincipal());
        verify(filterChain).doFilter(request, response);
    }

    @Test
    void shouldRedirectToLoginWhenTokenMissing() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getContextPath()).thenReturn("");
        when(request.getRequestURI()).thenReturn("/protected");
        when(jwtService.extractToken(request)).thenReturn(null);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(response).sendRedirect("/login");
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void shouldHandleInvalidToken() throws ServletException, IOException {
        String token = "invalid-jwt-token";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getContextPath()).thenReturn("");
        when(jwtService.extractToken(request)).thenReturn(token);
        doThrow(new AuthenticationFailureException("Invalid token"))
                .when(jwtService)
                .validateToken(token);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(jwtService).clearToken(response);
        verify(jwtService).validateToken(token);
        verify(authenticationEntryPoint)
                .commence(eq(request), eq(response), any(AuthenticationFailureException.class));
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void exceptionThrownWhenUserNotFound() throws ServletException, IOException {
        String token = "valid-jwt-token";
        String username = "nonexistentuser";
        Map<String, Object> claims = Map.of("sub", username, "authType", "WEB");

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getContextPath()).thenReturn("/");
        when(jwtService.extractToken(request)).thenReturn(token);
        when(jwtService.extractClaims(token)).thenReturn(claims);
        when(userDetailsService.loadUserByUsername(username)).thenReturn(null);

        UsernameNotFoundException result =
                assertThrows(
                        UsernameNotFoundException.class,
                        () ->
                                jwtAuthenticationFilter.doFilterInternal(
                                        request, response, filterChain));

        assertEquals("User not found: " + username, result.getMessage());
        verify(userDetailsService).loadUserByUsername(username);
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void shouldAuthenticateWithApiKey() throws ServletException, IOException {
        String apiKey = "api-key";
        User user = Mockito.mock(User.class);

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getContextPath()).thenReturn("");
        when(request.getRequestURI()).thenReturn("/api/resource");
        when(request.getHeader("X-API-KEY")).thenReturn(apiKey);
        when(user.getAuthorities()).thenReturn(Collections.emptySet());
        when(userService.getUserByApiKey(apiKey)).thenReturn(Optional.of(user));

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        assertNotNull(authentication);
        assertTrue(authentication instanceof ApiKeyAuthenticationToken);
        verify(filterChain).doFilter(request, response);
        verify(jwtService, never()).extractToken(any(HttpServletRequest.class));
    }

    @Test
    void shouldHandleInvalidApiKey() throws ServletException, IOException {
        String apiKey = "api-key";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getContextPath()).thenReturn("");
        when(request.getRequestURI()).thenReturn("/api/resource");
        when(request.getHeader("X-API-KEY")).thenReturn(apiKey);
        when(userService.getUserByApiKey(apiKey)).thenReturn(Optional.empty());

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(authenticationEntryPoint)
                .commence(eq(request), eq(response), any(AuthenticationFailureException.class));
        verify(jwtService).extractToken(request);
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void shouldHandleApiKeyAuthenticationException() throws ServletException, IOException {
        String apiKey = "api-key";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getContextPath()).thenReturn("");
        when(request.getRequestURI()).thenReturn("/api/resource");
        when(request.getHeader("X-API-KEY")).thenReturn(apiKey);
        doThrow(new AuthenticationFailureException("Invalid API Key"))
                .when(userService)
                .getUserByApiKey(apiKey);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(authenticationEntryPoint)
                .commence(eq(request), eq(response), any(AuthenticationFailureException.class));
        verify(jwtService).extractToken(request);
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void shouldProcessOauth2Authentication()
            throws ServletException, IOException, SQLException, UnsupportedProviderException {
        String token = "valid-jwt-token";
        String username = "oauth-user";
        Map<String, Object> claims = Map.of("sub", username, "authType", "OAUTH2");

        securityProperties.getOauth2().setAutoCreateUser(true);

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getContextPath()).thenReturn("");
        when(request.getRequestURI()).thenReturn("/protected");
        when(jwtService.extractToken(request)).thenReturn(token);
        when(jwtService.extractClaims(token)).thenReturn(claims);
        when(userDetails.getAuthorities()).thenReturn(Collections.emptyList());
        when(userDetailsService.loadUserByUsername(username)).thenReturn(userDetails);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(userService).processSSOPostLogin(username, true, AuthenticationType.OAUTH2);
        verify(filterChain).doFilter(request, response);
    }

    @Test
    void shouldHandleExceptionsDuringAuthentication()
            throws ServletException, IOException, SQLException, UnsupportedProviderException {
        String token = "valid-jwt-token";
        String username = "saml-user";
        Map<String, Object> claims = Map.of("sub", username, "authType", "SAML2");

        securityProperties.getSaml2().setAutoCreateUser(false);

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getContextPath()).thenReturn("");
        when(request.getRequestURI()).thenReturn("/protected");
        when(jwtService.extractToken(request)).thenReturn(token);
        when(jwtService.extractClaims(token)).thenReturn(claims);
        doThrow(new UnsupportedProviderException("error"))
                .when(userService)
                .processSSOPostLogin(username, false, AuthenticationType.SAML2);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(authenticationEntryPoint)
                .commence(eq(request), eq(response), any(AuthenticationFailureException.class));
        verify(filterChain, never()).doFilter(request, response);
    }
}
