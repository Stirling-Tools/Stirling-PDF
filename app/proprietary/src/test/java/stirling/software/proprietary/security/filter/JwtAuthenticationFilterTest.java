package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.Collections;
import java.util.Map;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.AuthenticationEntryPoint;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.UserService;

@Disabled
@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

    @Mock private JwtServiceInterface jwtService;

    @Mock private CustomUserDetailsService userDetailsService;

    @Mock private UserService userService;

    @Mock private ApplicationProperties.Security securityProperties;

    @Mock private HttpServletRequest request;

    @Mock private HttpServletResponse response;

    @Mock private FilterChain filterChain;

    @Mock private UserDetails userDetails;

    @Mock private SecurityContext securityContext;

    @Mock private AuthenticationEntryPoint authenticationEntryPoint;

    @InjectMocks private JwtAuthenticationFilter jwtAuthenticationFilter;

    @Test
    void shouldNotAuthenticateWhenJwtDisabled() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(false);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(jwtService, never()).extractToken(any());
    }

    @Test
    void shouldNotFilterWhenPageIsLogin() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/login");
        when(request.getContextPath()).thenReturn("/login");

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void testDoFilterInternal() throws ServletException, IOException {
        String token = "valid-jwt-token";
        String newToken = "new-jwt-token";
        String username = "testuser";
        Map<String, Object> claims = Map.of("sub", username, "authType", "WEB");

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getContextPath()).thenReturn("/");
        when(request.getRequestURI()).thenReturn("/protected");
        when(jwtService.extractToken(request)).thenReturn(token);
        doNothing().when(jwtService).validateToken(token);
        when(jwtService.extractClaims(token)).thenReturn(claims);
        when(userDetails.getAuthorities()).thenReturn(Collections.emptyList());
        when(userDetailsService.loadUserByUsername(username)).thenReturn(userDetails);

        try (MockedStatic<SecurityContextHolder> mockedSecurityContextHolder =
                mockStatic(SecurityContextHolder.class)) {
            UsernamePasswordAuthenticationToken authToken =
                    new UsernamePasswordAuthenticationToken(
                            userDetails, null, userDetails.getAuthorities());

            when(securityContext.getAuthentication()).thenReturn(null).thenReturn(authToken);
            mockedSecurityContextHolder
                    .when(SecurityContextHolder::getContext)
                    .thenReturn(securityContext);
            when(jwtService.generateToken(
                            any(UsernamePasswordAuthenticationToken.class), eq(claims)))
                    .thenReturn(newToken);

            jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

            verify(jwtService).validateToken(token);
            verify(jwtService).extractClaims(token);
            verify(userDetailsService).loadUserByUsername(username);
            verify(securityContext)
                    .setAuthentication(any(UsernamePasswordAuthenticationToken.class));
            verify(jwtService)
                    .generateToken(any(UsernamePasswordAuthenticationToken.class), eq(claims));
            verify(jwtService).addToken(response, newToken);
            verify(filterChain).doFilter(request, response);
        }
    }

    @Test
    void testDoFilterInternalWithMissingTokenForRootPath() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/");
        when(request.getMethod()).thenReturn("GET");
        when(jwtService.extractToken(request)).thenReturn(null);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(response).sendRedirect("/login");
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void validationFailsWithInvalidToken() throws ServletException, IOException {
        String token = "invalid-jwt-token";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getContextPath()).thenReturn("/");
        when(jwtService.extractToken(request)).thenReturn(token);
        doThrow(new AuthenticationFailureException("Invalid token"))
                .when(jwtService)
                .validateToken(token);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(jwtService).validateToken(token);
        verify(authenticationEntryPoint)
                .commence(eq(request), eq(response), any(AuthenticationFailureException.class));
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void validationFailsWithExpiredToken() throws ServletException, IOException {
        String token = "expired-jwt-token";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getContextPath()).thenReturn("/");
        when(jwtService.extractToken(request)).thenReturn(token);
        doThrow(new AuthenticationFailureException("The token has expired"))
                .when(jwtService)
                .validateToken(token);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(jwtService).validateToken(token);
        verify(authenticationEntryPoint).commence(eq(request), eq(response), any());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void exceptionThrown_WhenUserNotFound() throws ServletException, IOException {
        String token = "valid-jwt-token";
        String username = "nonexistentuser";
        Map<String, Object> claims = Map.of("sub", username, "authType", "WEB");

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getContextPath()).thenReturn("/");
        when(jwtService.extractToken(request)).thenReturn(token);
        doNothing().when(jwtService).validateToken(token);
        when(jwtService.extractClaims(token)).thenReturn(claims);
        when(userDetailsService.loadUserByUsername(username)).thenReturn(null);

        try (MockedStatic<SecurityContextHolder> mockedSecurityContextHolder =
                mockStatic(SecurityContextHolder.class)) {
            when(securityContext.getAuthentication()).thenReturn(null);
            mockedSecurityContextHolder
                    .when(SecurityContextHolder::getContext)
                    .thenReturn(securityContext);

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
    }

    @Test
    void testAuthenticationEntryPointCalledWithCorrectException()
            throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getContextPath()).thenReturn("/");
        when(jwtService.extractToken(request)).thenReturn(null);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(authenticationEntryPoint)
                .commence(
                        eq(request),
                        eq(response),
                        argThat(
                                exception ->
                                        exception
                                                .getMessage()
                                                .equals("JWT is missing from the request")));
        verify(filterChain, never()).doFilter(request, response);
    }
}
