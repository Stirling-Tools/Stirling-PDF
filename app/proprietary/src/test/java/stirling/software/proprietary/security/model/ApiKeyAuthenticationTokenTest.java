package stirling.software.proprietary.security.model;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * MIGRATION (Spring -> Quarkus): {@link ApiKeyAuthenticationToken} was reduced from a Spring
 * Security {@code AbstractAuthenticationToken} to a plain POJO. Authorities are now a {@code
 * Collection<String>} (was {@code Collection<? extends GrantedAuthority>}), so the role is supplied
 * and read as a bare string rather than a {@code SimpleGrantedAuthority}.
 */
class ApiKeyAuthenticationTokenTest {

    @Test
    void ctor_apiKeyOnly_isUnauthenticated_andStoresApiKey() {
        String apiKey = "abc-123";
        ApiKeyAuthenticationToken token = new ApiKeyAuthenticationToken(apiKey);

        assertFalse(token.isAuthenticated(), "should be unauthenticated");
        assertNull(token.getPrincipal(), "principal should be null for unauthenticated ctor");
        assertEquals(apiKey, token.getCredentials(), "credentials should store api key");
        // The single-arg constructor stores an empty (non-null) authorities collection.
        assertNotNull(token.getAuthorities());
        assertTrue(token.getAuthorities().isEmpty());
    }

    @Test
    void ctor_withPrincipalAndAuthorities_isAuthenticated_andStoresAll() {
        String apiKey = "xyz-999";
        Object principal = new Object();
        var authorities = List.of("ROLE_API");

        ApiKeyAuthenticationToken token =
                new ApiKeyAuthenticationToken(principal, apiKey, authorities);

        assertTrue(token.isAuthenticated(), "should be authenticated");
        assertSame(principal, token.getPrincipal(), "principal should be set");
        assertEquals(apiKey, token.getCredentials(), "credentials should store api key");
        assertNotNull(token.getAuthorities());
        assertEquals(1, token.getAuthorities().size());
        assertEquals("ROLE_API", token.getAuthorities().iterator().next());
    }

    @Test
    void setAuthenticated_true_throwsIllegalArgumentException() {
        ApiKeyAuthenticationToken token = new ApiKeyAuthenticationToken("k");

        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> token.setAuthenticated(true));
        assertTrue(
                ex.getMessage().toLowerCase().contains("trusted"),
                "message should explain to use the constructor with authorities");
    }

    @Test
    void setAuthenticated_false_isAllowed_andUnsetsFlag() {
        Object principal = new Object();
        ApiKeyAuthenticationToken token =
                new ApiKeyAuthenticationToken(principal, "k", List.of("ROLE_API"));

        assertTrue(token.isAuthenticated());

        // allowed to set to false (via the override method)
        token.setAuthenticated(false);

        assertFalse(token.isAuthenticated());
        assertSame(principal, token.getPrincipal(), "principal remains");
        assertEquals("k", token.getCredentials(), "credentials remain until erased");
    }

    @Test
    void eraseCredentials_setsCredentialsNull_butKeepsPrincipal() {
        Object principal = new Object();
        ApiKeyAuthenticationToken token =
                new ApiKeyAuthenticationToken(principal, "top-secret", List.of("ROLE_API"));

        assertEquals("top-secret", token.getCredentials());
        assertSame(principal, token.getPrincipal());

        token.eraseCredentials();

        assertNull(token.getCredentials(), "credentials should be nulled after erase");
        assertSame(principal, token.getPrincipal(), "principal should remain");
    }
}
