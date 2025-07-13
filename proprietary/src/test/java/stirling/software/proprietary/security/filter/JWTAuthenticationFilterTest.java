package stirling.software.proprietary.security.filter;

import jakarta.inject.Inject;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.AuthenticationEntryPoint;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JWTServiceInterface;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.Collection;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class JWTAuthenticationFilterTest {

    @Mock
    private JWTServiceInterface jwtService;

    @Mock
    private CustomUserDetailsService userDetailsService;

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    @Mock
    private FilterChain filterChain;

    @Mock
    private UserDetails userDetails;

    @Mock
    private SecurityContext securityContext;

    @Mock
    private PrintWriter printWriter;

    @Mock
    private AuthenticationEntryPoint authenticationEntryPoint;

    @InjectMocks
    private JWTAuthenticationFilter jwtAuthenticationFilter;

    @Test
    void shouldNotAuthenticateWhenJwtDisabled() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(false);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(jwtService, never()).extractTokenFromRequest(any());
    }

    @Test
    void shouldNotFilterWhenPageIsLogin() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/login");
        when(request.getMethod()).thenReturn("POST");

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(jwtService, never()).extractTokenFromRequest(any());
    }

    @Test
    void testDoFilterInternal() throws ServletException, IOException {
        String token = "valid-jwt-token";
        String newToken = "new-jwt-token";
        String username = "testuser";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getMethod()).thenReturn("GET");
        when(jwtService.extractTokenFromRequest(request)).thenReturn(token);
        doNothing().when(jwtService).validateToken(token);
        when(jwtService.extractUsername(token)).thenReturn(username);
        when(userDetails.getAuthorities()).thenReturn(Collections.emptyList());
        when(userDetailsService.loadUserByUsername(username)).thenReturn(userDetails);

        try (MockedStatic<SecurityContextHolder> mockedSecurityContextHolder = mockStatic(SecurityContextHolder.class)) {
            UsernamePasswordAuthenticationToken authToken =
                new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());

            when(securityContext.getAuthentication()).thenReturn(null).thenReturn(authToken);
            mockedSecurityContextHolder.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(jwtService.generateToken(authToken)).thenReturn(newToken);

            jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

            verify(jwtService).validateToken(token);
            verify(jwtService).extractUsername(token);
            verify(userDetailsService).loadUserByUsername(username);
            verify(securityContext).setAuthentication(any(UsernamePasswordAuthenticationToken.class));
            verify(jwtService).generateToken(authToken);
            verify(jwtService).addTokenToResponse(response, newToken);
            verify(filterChain).doFilter(request, response);
        }
    }

    @Test
    void testDoFilterInternalWithMissingTokenForRootPath() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/");
        when(request.getMethod()).thenReturn("GET");
        when(jwtService.extractTokenFromRequest(request)).thenReturn(null);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(response).sendRedirect("/login");
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void validationFailsWithInvalidToken() throws ServletException, IOException {
        String token = "invalid-jwt-token";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getMethod()).thenReturn("GET");
        when(jwtService.extractTokenFromRequest(request)).thenReturn(token);
        doThrow(new AuthenticationFailureException("Invalid token")).when(jwtService).validateToken(token);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(jwtService).validateToken(token);
        verify(authenticationEntryPoint).commence(eq(request), eq(response), any(AuthenticationFailureException.class));
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void validationFailsWithExpiredToken() throws ServletException, IOException {
        String token = "expired-jwt-token";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getMethod()).thenReturn("GET");
        when(jwtService.extractTokenFromRequest(request)).thenReturn(token);
        doThrow(new AuthenticationFailureException("The token has expired")).when(jwtService).validateToken(token);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(jwtService).validateToken(token);
        verify(authenticationEntryPoint).commence(eq(request), eq(response), any());
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void exceptinonThrown_WhenUserNotFound() throws ServletException, IOException {
        String token = "valid-jwt-token";
        String username = "nonexistentuser";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getMethod()).thenReturn("GET");
        when(jwtService.extractTokenFromRequest(request)).thenReturn(token);
        doNothing().when(jwtService).validateToken(token);
        when(jwtService.extractUsername(token)).thenReturn(username);
        when(userDetailsService.loadUserByUsername(username)).thenReturn(null);

        try (MockedStatic<SecurityContextHolder> mockedSecurityContextHolder = mockStatic(SecurityContextHolder.class)) {
            when(securityContext.getAuthentication()).thenReturn(null);
            mockedSecurityContextHolder.when(SecurityContextHolder::getContext).thenReturn(securityContext);

            UsernameNotFoundException result = assertThrows(UsernameNotFoundException.class, () -> jwtAuthenticationFilter.doFilterInternal(request, response, filterChain));

            assertEquals("User not found: " + username, result.getMessage());
            verify(userDetailsService).loadUserByUsername(username);
            verify(filterChain, never()).doFilter(request, response);
        }
    }

    @Test
    void shouldNotFilterLoginPost() {
        when(request.getRequestURI()).thenReturn("/login");
        when(request.getMethod()).thenReturn("POST");

        assertTrue(jwtAuthenticationFilter.shouldNotFilter(request));
    }

    @Test
    void shouldNotFilterLoginGet() {
        when(request.getRequestURI()).thenReturn("/login");
        when(request.getMethod()).thenReturn("GET");

        assertTrue(jwtAuthenticationFilter.shouldNotFilter(request));
    }

    @Test
    void shouldNotFilterPublicPaths() {
        String[] publicPaths = {
            "/register",
            "/error",
            "/images/logo.png",
            "/public/file.txt",
            "/css/style.css",
            "/fonts/font.ttf",
            "/js/script.js",
            "/pdfjs/viewer.js",
            "/pdfjs-legacy/viewer.js",
            "/api/v1/info/status",
            "/site.webmanifest",
            "/favicon.ico"
        };

        for (String path : publicPaths) {
            when(request.getRequestURI()).thenReturn(path);
            when(request.getMethod()).thenReturn("GET");

            assertTrue(jwtAuthenticationFilter.shouldNotFilter(request),
                      "Should not filter path: " + path);
        }
    }

    @Test
    void shouldNotFilterStaticFiles() {
        String[] staticFiles = {
            "/some/path/file.svg",
            "/another/path/image.png",
            "/path/to/icon.ico"
        };

        for (String file : staticFiles) {
            when(request.getRequestURI()).thenReturn(file);
            when(request.getMethod()).thenReturn("GET");

            assertTrue(jwtAuthenticationFilter.shouldNotFilter(request),
                      "Should not filter file: " + file);
        }
    }

    @Test
    void shouldFilterProtectedPaths() {
        String[] protectedPaths = {
            "/protected",
            "/api/v1/user/profile",
            "/admin",
            "/dashboard"
        };

        for (String path : protectedPaths) {
            when(request.getRequestURI()).thenReturn(path);
            when(request.getMethod()).thenReturn("GET");

            assertFalse(jwtAuthenticationFilter.shouldNotFilter(request),
                       "Should filter path: " + path);
        }
    }

    @Test
    void shouldFilterRootPath() {
        when(request.getRequestURI()).thenReturn("/");
        when(request.getMethod()).thenReturn("GET");

        assertFalse(jwtAuthenticationFilter.shouldNotFilter(request));
    }

    @Test
    void testAuthenticationEntryPointCalledWithCorrectException() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getMethod()).thenReturn("GET");
        when(jwtService.extractTokenFromRequest(request)).thenReturn(null);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(authenticationEntryPoint).commence(eq(request), eq(response), argThat(exception ->
            exception.getMessage().equals("JWT is missing from the request")
        ));
        verify(filterChain, never()).doFilter(request, response);
    }
}
