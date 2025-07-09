package stirling.software.proprietary.security.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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

    private JWTAuthenticationFilter jwtAuthenticationFilter;

    @BeforeEach
    void setUp() {
        jwtAuthenticationFilter = new JWTAuthenticationFilter(jwtService, userDetailsService);
    }

    @Test
    void testDoFilterInternalWhenJwtDisabled() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(false);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(jwtService, never()).extractTokenFromRequest(any());
    }

    @Test
    void testDoFilterInternalWhenShouldNotFilter() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/login");
        when(request.getMethod()).thenReturn("POST");

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(filterChain).doFilter(request, response);
        verify(jwtService, never()).extractTokenFromRequest(any());
    }

    @Test
    void testDoFilterInternalWithValidToken() throws ServletException, IOException {
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
            // Create the authentication token that will be set and returned
            UsernamePasswordAuthenticationToken authToken = 
                new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
            
            // Mock the security context behavior:
            // - First call (in createAuthToken): returns null
            // - Second call (in createAuthToken after setting): returns the created token
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
    void testDoFilterInternalWithMissingTokenForNonRootPath() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getMethod()).thenReturn("GET");
        when(jwtService.extractTokenFromRequest(request)).thenReturn(null);
        when(response.getWriter()).thenReturn(printWriter);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(response).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        verify(response).setContentType("application/json");
        verify(response).setCharacterEncoding("UTF-8");
        verify(printWriter).write(contains("JWT is missing from the request"));
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void testDoFilterInternalWithInvalidToken() throws ServletException, IOException {
        String token = "invalid-jwt-token";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getMethod()).thenReturn("GET");
        when(jwtService.extractTokenFromRequest(request)).thenReturn(token);
        doThrow(new AuthenticationFailureException("Invalid token")).when(jwtService).validateToken(token);
        when(response.getWriter()).thenReturn(printWriter);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(jwtService).validateToken(token);
        verify(response).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        verify(response).setContentType("application/json");
        verify(response).setCharacterEncoding("UTF-8");
        verify(printWriter).write(contains("Invalid token"));
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void testDoFilterInternalWithExpiredToken() throws ServletException, IOException {
        String token = "expired-jwt-token";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getMethod()).thenReturn("GET");
        when(jwtService.extractTokenFromRequest(request)).thenReturn(token);
        doThrow(new AuthenticationFailureException("The token has expired")).when(jwtService).validateToken(token);
        when(response.getWriter()).thenReturn(printWriter);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(jwtService).validateToken(token);
        verify(response).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        verify(response).setContentType("application/json");
        verify(response).setCharacterEncoding("UTF-8");
        verify(printWriter).write(contains("The token has expired"));
        verify(filterChain, never()).doFilter(request, response);
    }

    @Test
    void testDoFilterInternalWithUserNotFound() throws ServletException, IOException {
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

            assertThrows(UsernameNotFoundException.class, () -> {
                jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);
            });

            verify(userDetailsService).loadUserByUsername(username);
            verify(filterChain, never()).doFilter(request, response);
        }
    }

    @Test
    void testDoFilterInternalWithExistingAuthentication() throws ServletException, IOException {
        String token = "valid-jwt-token";
        String newToken = "new-jwt-token";
        String username = "testuser";

        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getMethod()).thenReturn("GET");
        when(jwtService.extractTokenFromRequest(request)).thenReturn(token);
        doNothing().when(jwtService).validateToken(token);
        when(jwtService.extractUsername(token)).thenReturn(username);

        try (MockedStatic<SecurityContextHolder> mockedSecurityContextHolder = mockStatic(SecurityContextHolder.class)) {
            Authentication existingAuth = mock(Authentication.class);
            when(securityContext.getAuthentication()).thenReturn(existingAuth);
            mockedSecurityContextHolder.when(SecurityContextHolder::getContext).thenReturn(securityContext);
            when(jwtService.generateToken(existingAuth)).thenReturn(newToken);

            jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

            verify(userDetailsService, never()).loadUserByUsername(anyString());
            verify(jwtService).generateToken(existingAuth);
            verify(jwtService).addTokenToResponse(response, newToken);
            verify(filterChain).doFilter(request, response);
        }
    }

    @Test
    void testShouldNotFilterLoginPost() {
        when(request.getRequestURI()).thenReturn("/login");
        when(request.getMethod()).thenReturn("POST");

        assertTrue(jwtAuthenticationFilter.shouldNotFilter(request));
    }

    @Test
    void testShouldNotFilterLoginGet() {
        when(request.getRequestURI()).thenReturn("/login");
        when(request.getMethod()).thenReturn("GET");

        assertTrue(jwtAuthenticationFilter.shouldNotFilter(request));
    }

    @Test
    void testShouldNotFilterPublicPaths() {
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
    void testShouldNotFilterStaticFiles() {
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
    void testShouldFilterProtectedPaths() {
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
    void testShouldFilterRootPath() {
        when(request.getRequestURI()).thenReturn("/");
        when(request.getMethod()).thenReturn("GET");

        assertFalse(jwtAuthenticationFilter.shouldNotFilter(request));
    }

    @Test
    void testSendUnauthorizedResponseFormat() throws ServletException, IOException {
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(request.getRequestURI()).thenReturn("/protected");
        when(request.getMethod()).thenReturn("GET");
        when(jwtService.extractTokenFromRequest(request)).thenReturn(null);
        when(response.getWriter()).thenReturn(printWriter);

        jwtAuthenticationFilter.doFilterInternal(request, response, filterChain);

        verify(response).setStatus(401);
        verify(response).setContentType("application/json");
        verify(response).setCharacterEncoding("UTF-8");
        verify(printWriter).write(argThat((String json) -> 
            json.contains("\"error\": \"Unauthorized\"") &&
            json.contains("\"message\": \"JWT is missing from the request\"") &&
            json.contains("\"status\": 401")
        ));
        verify(printWriter).flush();
    }
}