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
    private JwtKeystoreServiceInterface keystoreService;

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

        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);
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

        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);

        assertNotNull(token);
        assertFalse(token.isEmpty());
        assertEquals(username, jwtService.extractUsername(token));

        Map<String, Object> extractedClaims = jwtService.extractAllClaims(token);
        assertEquals("admin", extractedClaims.get("role"));
        assertEquals("IT", extractedClaims.get("department"));
    }

    @Test
    void testValidateTokenSuccess() {
        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn("testuser");

        String token = jwtService.generateToken(authentication, new HashMap<>());

        assertDoesNotThrow(() -> jwtService.validateToken(token));
    }

    @Test
    void testValidateTokenWithInvalidToken() {
        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);

        assertThrows(AuthenticationFailureException.class, () -> {
            jwtService.validateToken("invalid-token");
        });
    }

    @Test
    void testValidateTokenWithMalformedToken() {
        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);

        AuthenticationFailureException exception = assertThrows(AuthenticationFailureException.class, () -> {
            jwtService.validateToken("malformed.token");
        });

        assertTrue(exception.getMessage().contains("Invalid"));
    }

    @Test
    void testValidateTokenWithEmptyToken() {
        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);

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

        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(user);
        when(user.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);

        assertEquals(username, jwtService.extractUsername(token));
    }

    @Test
    void testExtractUsernameWithInvalidToken() {
        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);

        assertThrows(AuthenticationFailureException.class, () -> jwtService.extractUsername("invalid-token"));
    }

    @Test
    void testExtractAllClaims() {
        String username = "testuser";
        Map<String, Object> claims = Map.of("role", "admin", "department", "IT");

        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);
        Map<String, Object> extractedClaims = jwtService.extractAllClaims(token);

        assertEquals("admin", extractedClaims.get("role"));
        assertEquals("IT", extractedClaims.get("department"));
        assertEquals(username, extractedClaims.get("sub"));
        assertEquals("Stirling PDF", extractedClaims.get("iss"));
    }

    @Test
    void testExtractAllClaimsWithInvalidToken() {
        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);

        assertThrows(AuthenticationFailureException.class, () -> jwtService.extractAllClaims("invalid-token"));
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
        Cookie[] cookies = { new Cookie("stirling_jwt", token) };
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
        verify(response).addHeader(eq("Set-Cookie"), contains("stirling_jwt=" + token));
        verify(response).addHeader(eq("Set-Cookie"), contains("HttpOnly"));
        verify(response).addHeader(eq("Set-Cookie"), contains("Secure"));
    }

    @Test
    void testClearTokenFromResponse() {
        jwtService.clearTokenFromResponse(response);

        verify(response).setHeader("Authorization", null);
        verify(response).addHeader(eq("Set-Cookie"), contains("stirling_jwt="));
        verify(response).addHeader(eq("Set-Cookie"), contains("Max-Age=0"));
    }

    @Test
    void testGenerateTokenWithKeyId() {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();

        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);

        assertNotNull(token);
        assertFalse(token.isEmpty());
        // Verify that the keystore service was called
        verify(keystoreService).getActiveKeypair();
        verify(keystoreService).getActiveKeyId();
    }

    @Test
    void testTokenVerificationWithSpecificKeyId() throws NoSuchAlgorithmException {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();

        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        // Generate token with key ID
        String token = jwtService.generateToken(authentication, claims);

        // Mock extraction of key ID and verification (lenient to avoid unused stubbing)
        lenient().when(keystoreService.getKeypairByKeyId("test-key-id")).thenReturn(Optional.of(testKeyPair));

        // Verify token can be validated
        assertDoesNotThrow(() -> jwtService.validateToken(token));
        assertEquals(username, jwtService.extractUsername(token));
    }

    @Test
    void testTokenVerificationFallsBackToActiveKeyWhenKeyIdNotFound() {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();

        when(keystoreService.getActiveKeypair()).thenReturn(testKeyPair);
        when(keystoreService.getActiveKeyId()).thenReturn("test-key-id");
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);

        // Mock scenario where specific key ID is not found (lenient to avoid unused stubbing)
        lenient().when(keystoreService.getKeypairByKeyId("test-key-id")).thenReturn(Optional.empty());

        // Should still work using active keypair
        assertDoesNotThrow(() -> jwtService.validateToken(token));
        assertEquals(username, jwtService.extractUsername(token));

        // Verify fallback to active keypair was used (called multiple times during token operations)
        verify(keystoreService, atLeast(1)).getActiveKeypair();
    }
}
