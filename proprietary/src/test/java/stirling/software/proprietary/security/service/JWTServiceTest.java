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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;

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
    private Authentication authentication;

    @Mock
    private UserDetails userDetails;

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    @InjectMocks
    private JWTService jwtService;

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
        assertFalse(token.isEmpty());
        assertEquals(username, jwtService.extractUsername(token));

        Map<String, Object> extractedClaims = jwtService.extractAllClaims(token);
        assertEquals("admin", extractedClaims.get("role"));
        assertEquals("IT", extractedClaims.get("department"));
    }

    @Test
    void testValidateTokenSuccess() {
        String token = jwtService.generateToken("testuser", new HashMap<>());

        assertDoesNotThrow(() -> jwtService.validateToken(token));
    }

    @Test
    void testValidateTokenWithInvalidToken() {
        assertThrows(AuthenticationFailureException.class, () -> {
            jwtService.validateToken("invalid-token");
        });
    }

    // fixme
    @Test
    void testValidateTokenWithExpiredToken() {
        // Create a token that expires immediately
        JWTService shortLivedJwtService = new JWTService();
        String token = shortLivedJwtService.generateToken("testuser", new HashMap<>());

        // Wait a bit to ensure expiration
        try {
            Thread.sleep(10);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        assertThrows(AuthenticationFailureException.class, () -> {
            shortLivedJwtService.validateToken(token);
        });
    }

    @Test
    void testValidateTokenWithMalformedToken() {
        AuthenticationFailureException exception = assertThrows(AuthenticationFailureException.class, () -> {
            jwtService.validateToken("malformed.token");
        });

        assertTrue(exception.getMessage().contains("Invalid"));
    }

    @Test
    void testValidateTokenWithEmptyToken() {
        AuthenticationFailureException exception = assertThrows(AuthenticationFailureException.class, () -> {
            jwtService.validateToken("");
        });

        assertTrue(exception.getMessage().contains("Claims are empty") || exception.getMessage().contains("Invalid"));
    }

    @Test
    void testExtractUsername() {
        String username = "testuser";
        String token = jwtService.generateToken(username, new HashMap<>());

        assertEquals(username, jwtService.extractUsername(token));
    }

    @Test
    void testExtractUsernameWithInvalidToken() {
        assertThrows(AuthenticationFailureException.class, () -> jwtService.extractUsername("invalid-token"));
    }

    @Test
    void testExtractAllClaims() {
        String username = "testuser";
        Map<String, Object> claims = Map.of("role", "admin", "department", "IT");

        String token = jwtService.generateToken(username, claims);
        Map<String, Object> extractedClaims = jwtService.extractAllClaims(token);

        assertEquals("admin", extractedClaims.get("role"));
        assertEquals("IT", extractedClaims.get("department"));
        assertEquals(username, extractedClaims.get("sub"));
        assertEquals("Stirling PDF", extractedClaims.get("iss"));
    }

    @Test
    void testExtractAllClaimsWithInvalidToken() {
        assertThrows(AuthenticationFailureException.class, () -> jwtService.extractAllClaims("invalid-token"));
    }

    // fixme
    @Test
    void testIsTokenExpired() {
        String token = jwtService.generateToken("testuser", new HashMap<>());
        assertFalse(jwtService.isTokenExpired(token));

        JWTService shortLivedJwtService = new JWTService();
        String expiredToken = shortLivedJwtService.generateToken("testuser", new HashMap<>());

        try {
            Thread.sleep(10);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        assertThrows(AuthenticationFailureException.class, () -> shortLivedJwtService.isTokenExpired(expiredToken));
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
        Cookie[] cookies = { new Cookie("STIRLING_JWT", token) };
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
}
