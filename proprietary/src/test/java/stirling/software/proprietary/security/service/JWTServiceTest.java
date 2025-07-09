package stirling.software.proprietary.security.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.UnsupportedJwtException;
import io.jsonwebtoken.security.SignatureException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import stirling.software.common.model.ApplicationProperties;

import java.security.KeyPair;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class JWTServiceTest {

    @Mock
    private ApplicationProperties.Security securityProperties;

    @Mock
    private ApplicationProperties.Security.JWT jwtProperties;

    @Mock
    private Authentication authentication;

    @Mock
    private UserDetails userDetails;

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    private JWTService jwtService;

    @BeforeEach
    void setUp() {
        lenient().when(securityProperties.getJwt()).thenReturn(jwtProperties);
        lenient().when(securityProperties.isJwtActive()).thenReturn(true);
        lenient().when(jwtProperties.isSettingsValid()).thenReturn(true);
        lenient().when(jwtProperties.getExpiration()).thenReturn(3600000L);
        lenient().when(jwtProperties.getIssuer()).thenReturn("Stirling-PDF");

        jwtService = new JWTService(securityProperties);
    }

    @Test
    void testGenerateTokenWithAuthentication() {
        String username = "testuser";
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication);

        assertNotNull(token);
        assertTrue(token.length() > 0);
        assertEquals(username, jwtService.extractUsername(token));
    }

    @Test
    void testGenerateTokenWithUsernameAndClaims() {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", "admin");
        claims.put("department", "IT");

        String token = jwtService.generateToken(username, claims);

        assertNotNull(token);
        assertTrue(token.length() > 0);
        assertEquals(username, jwtService.extractUsername(token));

        Map<String, Object> extractedClaims = jwtService.extractAllClaims(token);
        assertEquals("admin", extractedClaims.get("role"));
        assertEquals("IT", extractedClaims.get("department"));
    }

    @Test
    void testGenerateTokenWhenJwtDisabled() {
        when(securityProperties.isJwtActive()).thenReturn(false);

        assertThrows(IllegalStateException.class, () -> {
            jwtService.generateToken("testuser", new HashMap<>());
        });
    }

    @Test
    void testValidateTokenSuccess() {
        String token = jwtService.generateToken("testuser", new HashMap<>());

        assertTrue(jwtService.validateToken(token));
    }

    @Test
    void testValidateTokenWhenJwtDisabled() {
        when(securityProperties.isJwtActive()).thenReturn(false);

        assertFalse(jwtService.validateToken("any-token"));
    }

    @Test
    void testValidateTokenWithInvalidToken() {
        assertFalse(jwtService.validateToken("invalid-token"));
    }

    @Test
    void testValidateTokenWithExpiredToken() {
        // Create a token that expires immediately
        when(jwtProperties.getExpiration()).thenReturn(1L);
        JWTService shortLivedJwtService = new JWTService(securityProperties);
        String token = shortLivedJwtService.generateToken("testuser", new HashMap<>());

        // Wait a bit to ensure expiration
        try {
            Thread.sleep(10);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        assertFalse(shortLivedJwtService.validateToken(token));
    }

    @Test
    void testExtractUsername() {
        String username = "testuser";
        String token = jwtService.generateToken(username, new HashMap<>());

        assertEquals(username, jwtService.extractUsername(token));
    }

    @Test
    void testExtractAllClaims() {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", "admin");
        claims.put("department", "IT");

        String token = jwtService.generateToken(username, claims);
        Map<String, Object> extractedClaims = jwtService.extractAllClaims(token);

        assertEquals("admin", extractedClaims.get("role"));
        assertEquals("IT", extractedClaims.get("department"));
        assertEquals(username, extractedClaims.get("sub"));
        assertEquals("Stirling-PDF", extractedClaims.get("iss"));
    }

    @Test
    void testExtractAllClaimsWhenJwtDisabled() {
        when(securityProperties.isJwtActive()).thenReturn(false);

        assertThrows(IllegalStateException.class, () -> {
            jwtService.extractAllClaims("any-token");
        });
    }

    @Test
    void testIsTokenExpired() {
        String token = jwtService.generateToken("testuser", new HashMap<>());
        assertFalse(jwtService.isTokenExpired(token));

        when(jwtProperties.getExpiration()).thenReturn(1L);
        JWTService shortLivedJwtService = new JWTService(securityProperties);
        String expiredToken = shortLivedJwtService.generateToken("testuser", new HashMap<>());

        try {
            Thread.sleep(10);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        assertThrows(ExpiredJwtException.class, () -> assertTrue(shortLivedJwtService.isTokenExpired(expiredToken)));
    }

    @Test
    void testExtractTokenFromRequestWithAuthorizationHeader() {
        String token = "test-token";
        when(request.getHeader("Authorization")).thenReturn("Bearer " + token);

        assertEquals(token, jwtService.extractTokenFromRequest(request));
    }

    @Test
    void testExtractTokenFromRequestWithCookie() {
        String token = "test-token";
        Cookie[] cookies = {new Cookie("STIRLING_JWT", token)};
        when(request.getHeader("Authorization")).thenReturn(null);
        when(request.getCookies()).thenReturn(cookies);

        assertEquals(token, jwtService.extractTokenFromRequest(request));
    }

    @Test
    void testExtractTokenFromRequestWithNoCookies() {
        when(request.getHeader("Authorization")).thenReturn(null);
        when(request.getCookies()).thenReturn(null);

        assertNull(jwtService.extractTokenFromRequest(request));
    }

    @Test
    void testExtractTokenFromRequestWithWrongCookie() {
        Cookie[] cookies = {new Cookie("OTHER_COOKIE", "value")};
        when(request.getHeader("Authorization")).thenReturn(null);
        when(request.getCookies()).thenReturn(cookies);

        assertNull(jwtService.extractTokenFromRequest(request));
    }

    @Test
    void testExtractTokenFromRequestWithInvalidAuthorizationHeader() {
        when(request.getHeader("Authorization")).thenReturn("Basic token");
        when(request.getCookies()).thenReturn(null);

        assertNull(jwtService.extractTokenFromRequest(request));
    }

    @Test
    void testAddTokenToResponse() {
        String token = "test-token";

        jwtService.addTokenToResponse(response, token);

        verify(response).setHeader("Authorization", "Bearer " + token);
        verify(response).addHeader(eq("Set-Cookie"), contains("STIRLING_JWT=" + token));
        verify(response).addHeader(eq("Set-Cookie"), contains("HttpOnly"));
        verify(response).addHeader(eq("Set-Cookie"), contains("Secure"));
        verify(response).addHeader(eq("Set-Cookie"), contains("SameSite=Strict"));
    }

    @Test
    void testClearTokenFromResponse() {
        jwtService.clearTokenFromResponse(response);

        verify(response).setHeader("Authorization", "");
        verify(response).addHeader(eq("Set-Cookie"), contains("STIRLING_JWT="));
        verify(response).addHeader(eq("Set-Cookie"), contains("Max-Age=0"));
    }

    @Test
    void testIsJwtEnabledWhenEnabled() {
        when(securityProperties.isJwtActive()).thenReturn(true);
        when(jwtProperties.isSettingsValid()).thenReturn(true);

        assertTrue(jwtService.isJwtEnabled());
    }

    @Test
    void testIsJwtEnabledWhenDisabled() {
        when(securityProperties.isJwtActive()).thenReturn(false);

        assertFalse(jwtService.isJwtEnabled());
    }

    @Test
    void testIsJwtEnabledWhenInvalidSettings() {
        when(securityProperties.isJwtActive()).thenReturn(true);
        when(jwtProperties.isSettingsValid()).thenReturn(false);

        assertFalse(jwtService.isJwtEnabled());
    }

    @Test
    void testIsJwtEnabledWhenJwtPropertiesNull() {
        when(securityProperties.isJwtActive()).thenReturn(true);
        when(securityProperties.getJwt()).thenReturn(null);

        JWTService jwtServiceWithNullProps = new JWTService(securityProperties);
        assertFalse(jwtServiceWithNullProps.isJwtEnabled());
    }
}
