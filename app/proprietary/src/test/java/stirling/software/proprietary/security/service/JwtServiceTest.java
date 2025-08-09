package stirling.software.proprietary.security.service;

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

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.proprietary.security.model.JwtVerificationKey;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.exception.AuthenticationFailureException;

@ExtendWith(MockitoExtension.class)
class JwtServiceTest {

    @Mock private Authentication authentication;

    @Mock private User userDetails;

    @Mock private HttpServletRequest request;

    @Mock private HttpServletResponse response;

    @Mock private KeyPersistenceServiceInterface keystoreService;

    private JwtService jwtService;
    private KeyPair testKeyPair;
    private JwtVerificationKey testVerificationKey;

    @BeforeEach
    void setUp() throws NoSuchAlgorithmException {
        // Generate a test keypair
        KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA");
        keyPairGenerator.initialize(2048);
        testKeyPair = keyPairGenerator.generateKeyPair();

        // Create test verification key
        String encodedPublicKey =
                Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded());
        testVerificationKey = new JwtVerificationKey("test-key-id", encodedPublicKey);

        jwtService = new JwtService(true, keystoreService);
    }

    @Test
    void testGenerateTokenWithAuthentication() throws Exception {
        String username = "testuser";

        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.getKeyPair("test-key-id")).thenReturn(Optional.of(testKeyPair));
        when(keystoreService.decodePublicKey(testVerificationKey.getVerifyingKey()))
                .thenReturn(testKeyPair.getPublic());
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, Collections.emptyMap());

        assertNotNull(token);
        assertFalse(token.isEmpty());
        assertEquals(username, jwtService.extractUsername(token));
    }

    @Test
    void testGenerateTokenWithUsernameAndClaims() throws Exception {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();
        claims.put("role", "admin");
        claims.put("department", "IT");

        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.getKeyPair("test-key-id")).thenReturn(Optional.of(testKeyPair));
        when(keystoreService.decodePublicKey(testVerificationKey.getVerifyingKey()))
                .thenReturn(testKeyPair.getPublic());
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
    void testValidateTokenSuccess() throws Exception {
        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.getKeyPair("test-key-id")).thenReturn(Optional.of(testKeyPair));
        when(keystoreService.decodePublicKey(testVerificationKey.getVerifyingKey()))
                .thenReturn(testKeyPair.getPublic());
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn("testuser");

        String token = jwtService.generateToken(authentication, new HashMap<>());

        assertDoesNotThrow(() -> jwtService.validateToken(token));
    }

    @Test
    void testValidateTokenWithInvalidToken() throws Exception {
        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.decodePublicKey(testVerificationKey.getVerifyingKey()))
                .thenReturn(testKeyPair.getPublic());

        assertThrows(
                AuthenticationFailureException.class,
                () -> {
                    jwtService.validateToken("invalid-token");
                });
    }

    @Test
    void testValidateTokenWithMalformedToken() throws Exception {
        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.decodePublicKey(testVerificationKey.getVerifyingKey()))
                .thenReturn(testKeyPair.getPublic());

        AuthenticationFailureException exception =
                assertThrows(
                        AuthenticationFailureException.class,
                        () -> {
                            jwtService.validateToken("malformed.token");
                        });

        assertTrue(exception.getMessage().contains("Invalid"));
    }

    @Test
    void testValidateTokenWithEmptyToken() throws Exception {
        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.decodePublicKey(testVerificationKey.getVerifyingKey()))
                .thenReturn(testKeyPair.getPublic());

        AuthenticationFailureException exception =
                assertThrows(
                        AuthenticationFailureException.class,
                        () -> {
                            jwtService.validateToken("");
                        });

        assertTrue(
                exception.getMessage().contains("Claims are empty")
                        || exception.getMessage().contains("Invalid"));
    }

    @Test
    void testExtractUsername() throws Exception {
        String username = "testuser";
        User user = mock(User.class);
        Map<String, Object> claims = Map.of("sub", "testuser", "authType", "WEB");

        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.getKeyPair("test-key-id")).thenReturn(Optional.of(testKeyPair));
        when(keystoreService.decodePublicKey(testVerificationKey.getVerifyingKey()))
                .thenReturn(testKeyPair.getPublic());
        when(authentication.getPrincipal()).thenReturn(user);
        when(user.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);

        assertEquals(username, jwtService.extractUsername(token));
    }

    @Test
    void testExtractUsernameWithInvalidToken() throws Exception {
        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.decodePublicKey(testVerificationKey.getVerifyingKey()))
                .thenReturn(testKeyPair.getPublic());

        assertThrows(
                AuthenticationFailureException.class,
                () -> jwtService.extractUsername("invalid-token"));
    }

    @Test
    void testExtractClaims() throws Exception {
        String username = "testuser";
        Map<String, Object> claims = Map.of("role", "admin", "department", "IT");

        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.getKeyPair("test-key-id")).thenReturn(Optional.of(testKeyPair));
        when(keystoreService.decodePublicKey(testVerificationKey.getVerifyingKey()))
                .thenReturn(testKeyPair.getPublic());
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
    void testExtractClaimsWithInvalidToken() throws Exception {
        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.decodePublicKey(testVerificationKey.getVerifyingKey()))
                .thenReturn(testKeyPair.getPublic());

        assertThrows(
                AuthenticationFailureException.class,
                () -> jwtService.extractClaims("invalid-token"));
    }

    @Test
    void testExtractTokenWithCookie() {
        String token = "test-token";
        Cookie[] cookies = {new Cookie("stirling_jwt", token)};
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

        verify(response).addHeader(eq("Set-Cookie"), contains("stirling_jwt=" + token));
        verify(response).addHeader(eq("Set-Cookie"), contains("HttpOnly"));

        if (secureCookie) {
            verify(response).addHeader(eq("Set-Cookie"), contains("Secure"));
        }
    }

    @Test
    void testClearToken() {
        jwtService.clearToken(response);

        verify(response).addHeader(eq("Set-Cookie"), contains("stirling_jwt="));
        verify(response).addHeader(eq("Set-Cookie"), contains("Max-Age=0"));
    }

    @Test
    void testGenerateTokenWithKeyId() throws Exception {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();

        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.getKeyPair("test-key-id")).thenReturn(Optional.of(testKeyPair));
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);

        assertNotNull(token);
        assertFalse(token.isEmpty());
        // Verify that the keystore service was called
        verify(keystoreService).getActiveKey();
        verify(keystoreService).getKeyPair("test-key-id");
    }

    @Test
    void testTokenVerificationWithSpecificKeyId() throws Exception {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();

        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.getKeyPair("test-key-id")).thenReturn(Optional.of(testKeyPair));
        when(keystoreService.decodePublicKey(testVerificationKey.getVerifyingKey()))
                .thenReturn(testKeyPair.getPublic());
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        // Generate token with key ID
        String token = jwtService.generateToken(authentication, claims);

        // Mock extraction of key ID and verification (lenient to avoid unused stubbing)
        lenient()
                .when(keystoreService.getKeyPair("test-key-id"))
                .thenReturn(Optional.of(testKeyPair));

        // Verify token can be validated
        assertDoesNotThrow(() -> jwtService.validateToken(token));
        assertEquals(username, jwtService.extractUsername(token));
    }

    @Test
    void testTokenVerificationFallsBackToActiveKeyWhenKeyIdNotFound() throws Exception {
        String username = "testuser";
        Map<String, Object> claims = new HashMap<>();

        // First, generate a token successfully
        when(keystoreService.getActiveKey()).thenReturn(testVerificationKey);
        when(keystoreService.getKeyPair("test-key-id")).thenReturn(Optional.of(testKeyPair));
        when(keystoreService.decodePublicKey(testVerificationKey.getVerifyingKey()))
                .thenReturn(testKeyPair.getPublic());
        when(authentication.getPrincipal()).thenReturn(userDetails);
        when(userDetails.getUsername()).thenReturn(username);

        String token = jwtService.generateToken(authentication, claims);

        // Now mock the scenario for validation - key not found, but fallback works
        // Create a fallback key pair that can be used
        JwtVerificationKey fallbackKey =
                new JwtVerificationKey(
                        "fallback-key",
                        Base64.getEncoder().encodeToString(testKeyPair.getPublic().getEncoded()));

        // Mock the specific key lookup to fail, but the active key should work
        when(keystoreService.getKeyPair("test-key-id")).thenReturn(Optional.empty());
        when(keystoreService.refreshActiveKeyPair()).thenReturn(fallbackKey);
        when(keystoreService.getKeyPair("fallback-key")).thenReturn(Optional.of(testKeyPair));

        // Should still work by falling back to the active keypair
        assertDoesNotThrow(() -> jwtService.validateToken(token));
        assertEquals(username, jwtService.extractUsername(token));

        // Verify fallback logic was used
        verify(keystoreService, atLeast(1)).getActiveKey();
    }

    private JwtService createJwtServiceWithSecureCookie(boolean secureCookie) throws Exception {
        // Use reflection to create JwtService with custom secureCookie value
        JwtService testService = new JwtService(true, keystoreService);

        // Set the secureCookie field using reflection
        java.lang.reflect.Field secureCookieField =
                JwtService.class.getDeclaredField("secureCookie");
        secureCookieField.setAccessible(true);
        secureCookieField.set(testService, secureCookie);

        return testService;
    }
}
