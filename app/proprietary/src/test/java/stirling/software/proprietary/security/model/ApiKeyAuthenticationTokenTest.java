package stirling.software.proprietary.security.model;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

class ApiKeyAuthenticationTokenTest {

    @Test
    void ctor_apiKeyOnly_isUnauthenticated_andStoresApiKey() {
        String apiKey = "abc-123";
        ApiKeyAuthenticationToken token = new ApiKeyAuthenticationToken(apiKey);

        assertFalse(token.isAuthenticated(), "should be unauthenticated");
        assertNull(token.getPrincipal(), "principal should be null for unauthenticated ctor");
        assertEquals(apiKey, token.getCredentials(), "credentials should store api key");
        // Authorities: do not check version-dependent behavior (can be null or empty depending on
        // Spring Security)
    }

    @Test
    void ctor_withPrincipalAndAuthorities_isAuthenticated_andStoresAll() {
        String apiKey = "xyz-999";
        Object principal = new Object();
        var authorities = List.of(new SimpleGrantedAuthority("ROLE_API"));

        ApiKeyAuthenticationToken token =
                new ApiKeyAuthenticationToken(principal, apiKey, authorities);

        assertTrue(token.isAuthenticated(), "should be authenticated");
        assertSame(principal, token.getPrincipal(), "principal should be set");
        assertEquals(apiKey, token.getCredentials(), "credentials should store api key");
        assertNotNull(token.getAuthorities());
        assertEquals(1, token.getAuthorities().size());
        assertEquals("ROLE_API", token.getAuthorities().iterator().next().getAuthority());
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
                new ApiKeyAuthenticationToken(
                        principal, "k", List.of(new SimpleGrantedAuthority("ROLE_API")));

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
                new ApiKeyAuthenticationToken(
                        principal, "top-secret", List.of(new SimpleGrantedAuthority("ROLE_API")));

        assertEquals("top-secret", token.getCredentials());
        assertSame(principal, token.getPrincipal());

        token.eraseCredentials();

        assertNull(token.getCredentials(), "credentials should be nulled after erase");
        assertSame(principal, token.getPrincipal(), "principal should remain");
    }
}
