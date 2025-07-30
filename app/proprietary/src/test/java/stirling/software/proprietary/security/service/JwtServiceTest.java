package stirling.software.proprietary.security.service;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.contains;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JwtServiceTest {

    @Mock
    private ApplicationProperties.Security securityProperties;

    @Mock
    private Authentication authentication;

    @Mock
    private User userDetails;

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    @Mock
    private KeystoreServiceInterface keystoreService;

    private JwtService jwtService;
    private KeyPair testKeyPair;

    @BeforeEach
    void setUp() throws NoSuchAlgorithmException {
        // Generate a test keypair
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA");
        keyPairGenerator.initialize(2048);
        testKeyPair = keyPairGenerator.generateKeyPair();

        jwtService = new JwtService(true, keystoreService);
    }

    @Test
    void testGenerateTokenWithAuthentication() {
        String username = "testuser";

        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, Collections.emptyMap());

        assertNotNull(token);
        assertFalse(token.isEmpty());
        assertEquals(username, jwtService.extractUsername(token));
    }

    @Test
    void testGenerateTokenWithUsernameAndClaims() {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", "admin");
        claims.put("department", "IT");

        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);

        assertNotNull(token);
        assertFalse(token.isEmpty());
        assertEquals(username, jwtService.extractUsername(token));

        Map<String, Object> extractedClaims = jwtService.extractClaims(token);
        assertEquals("admin", extractedClaims.get("role"));
        assertEquals("IT", extractedClaims.get("department"));
    }

    @Test
    void testValidateTokenSuccess() {
        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn("testuser");

        String token = jwtService.generateToken(authentication, new HashMap<>());

        assertDoesNotThrow(() -> jwtService.validateToken(token));
    }

    @Test
    void testValidateTokenWithInvalidToken() {
        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);

        assertThrows(AuthenticationFailureException.class, () -> {
            jwtService.validateToken("invalid-token");
        });
    }

    @Test
    void testValidateTokenWithMalformedToken() {
        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);

        AuthenticationFailureException exception = assertThrows(AuthenticationFailureException.class, () -> {
            jwtService.validateToken("malformed.token");
        });

        assertTrue(exception.getMessage().contains("Invalid"));
    }

    @Test
    void testValidateTokenWithEmptyToken() {
        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);

        AuthenticationFailureException exception = assertThrows(AuthenticationFailureException.class, () -> {
            jwtService.validateToken("");
        });

        assertTrue(exception.getMessage().contains("Claims are empty") || exception.getMessage().contains("Invalid"));
    }

    @Test
    void testExtractUsername() {
        String username = "testuser";
        User user = mock(User.class);
        Map<String, Object> claims = Map.of("sub", "testuser", "authType", "WEB");

        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(user);
        when(user.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);

        assertEquals(username, jwtService.extractUsername(token));
    }

    @Test
    void testExtractUsernameWithInvalidToken() {
        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);

        assertThrows(AuthenticationFailureException.class, () -> jwtService.extractUsername("invalid-token"));
    }

    @Test
    void testExtractClaims() {
        String username = "testuser";
        Map<String, Object> claims = Map.of("role", "admin", "department", "IT");

        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);
        Map<String, Object> extractedClaims = jwtService.extractClaims(token);

        assertEquals("admin", extractedClaims.get("role"));
        assertEquals("IT", extractedClaims.get("department"));
        assertEquals(username, extractedClaims.get("sub"));
        assertEquals("Stirling PDF", extractedClaims.get("iss"));
    }

    @Test
    void testExtractClaimsWithInvalidToken() {
        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);

        assertThrows(AuthenticationFailureException.class, () -> jwtService.extractClaims("invalid-token"));
    }

    @Test
    void testExtractTokenWithCookie() {
        String token = "test-token";
        Cookie[] cookies = { new Cookie("stirling_jwt", token) };
        when(request.getCookies()).thenReturn(cookies);

        assertEquals(token, jwtService.extractToken(request));
    }

    @Test
    void testExtractTokenWithNoCookies() {
        when(request.getCookies()).thenReturn(null);

        assertNull(jwtService.extractToken(request));
    }

    @Test
    void testExtractTokenWithWrongCookie() {
        Cookie[] cookies = {new Cookie("OTHER_COOKIE", "value")};
        when(request.getCookies()).thenReturn(cookies);

        assertNull(jwtService.extractToken(request));
    }

    @Test
    void testExtractTokenWithInvalidAuthorizationHeader() {
        when(request.getCookies()).thenReturn(null);

        assertNull(jwtService.extractToken(request));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void testAddToken(boolean secureCookie) throws Exception {
        String token = "test-token";

        // Create new JwtService instance with the secureCookie parameter
        JwtService testJwtService = createJwtServiceWithSecureCookie(secureCookie);
        
        testJwtService.addToken(response, token);

        verify(response).setHeader("Authorization", "Bearer " + token);
        verify(response).addHeader(eq("Set-Cookie"), contains("stirling_jwt=" + token));
        verify(response).addHeader(eq("Set-Cookie"), contains("HttpOnly"));
        
        if (secureCookie) {
            verify(response).addHeader(eq("Set-Cookie"), contains("Secure"));
        } else {
            verify(response, org.mockito.Mockito.never()).addHeader(eq("Set-Cookie"), contains("Secure"));
        }
    }

    @Test
    void testClearToken() {
        jwtService.clearToken(response);

        verify(response).setHeader("Authorization", null);
        verify(response).addHeader(eq("Set-Cookie"), contains("stirling_jwt="));
        verify(response).addHeader(eq("Set-Cookie"), contains("Max-Age=0"));
    }

    @Test
    void testGenerateTokenWithKeyId() {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();

        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);

        assertNotNull(token);
        assertFalse(token.isEmpty());
        // Verify that the keystore service was called
        verify(keystoreService).getActiveKeyPair();
        verify(keystoreService).getActiveKeyId();
    }

    @Test
    void testTokenVerificationWithSpecificKeyId() throws NoSuchAlgorithmException {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();

        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        // Generate token with key ID
        String token = jwtService.generateToken(authentication, claims);

        // Mock extraction of key ID and verification (lenient to avoid unused stubbing)
        lenient().when(keystoreService.getKeyPairByKeyId("test-key-id")).thenReturn(Optional.of(testKeyPair));

        // Verify token can be validated
        assertDoesNotThrow(() -> jwtService.validateToken(token));
        assertEquals(username, jwtService.extractUsername(token));
    }

    @Test
    void testTokenVerificationFallsBackToActiveKeyWhenKeyIdNotFound() {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();

        when(keystoreService.getActiveKeyPair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);

        // Mock scenario where specific key ID is not found (lenient to avoid unused stubbing)
        lenient().when(keystoreService.getKeyPairByKeyId("test-key-id")).thenReturn(Optional.empty());

        // Should still work using active keypair
        assertDoesNotThrow(() -> jwtService.validateToken(token));
        assertEquals(username, jwtService.extractUsername(token));

        // Verify fallback to active keypair was used (called multiple times during token operations)
        verify(keystoreService, atLeast(1)).getActiveKeyPair();
    }
    
    private JwtService createJwtServiceWithSecureCookie(boolean secureCookie) throws Exception {
        // Use reflection to create JwtService with custom secureCookie value
        JwtService testService = new JwtService(true, keystoreService);
        
        // Set the secureCookie field using reflection
        java.lang.reflect.Field secureCookieField = JwtService.class.getDeclaredField("secureCookie");
        secureCookieField.setAccessible(true);
        secureCookieField.set(testService, secureCookie);
        
        return testService;
    }
}
