package stirling.software.saas.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authorization.AuthorityAuthorizationManager;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/**
 * Verifies what Spring Security's {@link AuthorityAuthorizationManager#hasRole(String)} actually
 * accepts. The OSS proprietary module uses {@code @PreAuthorize("hasRole('ROLE_ADMIN')")} on dozens
 * of admin endpoints that work in production — so before "fixing" the same pattern in {@code
 * :saas}, prove what the real behaviour is.
 */
class HasRolePrefixTest {

    private static final Authentication PRINCIPAL_WITH_ROLE_ADMIN_AUTHORITY =
            new UsernamePasswordAuthenticationToken(
                    "alice", "pw", List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));

    @Test
    void hasRole_with_bare_ADMIN_matches_ROLE_ADMIN_authority() {
        AuthorityAuthorizationManager<Object> mgr = AuthorityAuthorizationManager.hasRole("ADMIN");
        AuthorizationResult result =
                mgr.authorize(supplier(PRINCIPAL_WITH_ROLE_ADMIN_AUTHORITY), new Object());
        assertTrue(result.isGranted(), "hasRole('ADMIN') must match authority ROLE_ADMIN");
    }

    @Test
    void hasRole_with_ROLE_ADMIN_throws_or_denies_against_ROLE_ADMIN_authority() {
        // The point of this test is to record EXACTLY what Spring does so we can act on it.
        // System.err output captures the observed behaviour so the build log shows which branch
        // was taken.
        Exception thrown = null;
        AuthorizationResult result = null;
        try {
            AuthorityAuthorizationManager<Object> mgr =
                    AuthorityAuthorizationManager.hasRole("ROLE_ADMIN");
            result = mgr.authorize(supplier(PRINCIPAL_WITH_ROLE_ADMIN_AUTHORITY), new Object());
        } catch (Exception e) {
            thrown = e;
        }

        if (thrown != null) {
            System.err.println(
                    "[HasRolePrefixTest] hasRole('ROLE_ADMIN') THREW: "
                            + thrown.getClass().getSimpleName()
                            + ": "
                            + thrown.getMessage());
        } else {
            System.err.println(
                    "[HasRolePrefixTest] hasRole('ROLE_ADMIN') returned granted="
                            + result.isGranted());
        }

        // The proprietary module has dozens of @PreAuthorize("hasRole('ROLE_ADMIN')") usages in
        // production. If this assert fails, those endpoints are NOT actually broken — Spring is
        // silently tolerating the redundant prefix.
        boolean broken = thrown != null || !result.isGranted();
        assertTrue(
                broken,
                "Spring Security accepted hasRole('ROLE_ADMIN') against authority ROLE_ADMIN — the"
                        + " redundant prefix is silently tolerated by this Spring version.");
    }

    @Test
    void hasAuthority_with_ROLE_ADMIN_matches() {
        AuthorityAuthorizationManager<Object> mgr =
                AuthorityAuthorizationManager.hasAuthority("ROLE_ADMIN");
        AuthorizationResult result =
                mgr.authorize(supplier(PRINCIPAL_WITH_ROLE_ADMIN_AUTHORITY), new Object());
        assertTrue(result.isGranted(), "hasAuthority('ROLE_ADMIN') must match");
    }

    @Test
    void hasRole_with_USER_does_not_match_admin_authority() {
        AuthorityAuthorizationManager<Object> mgr = AuthorityAuthorizationManager.hasRole("USER");
        AuthorizationResult result =
                mgr.authorize(supplier(PRINCIPAL_WITH_ROLE_ADMIN_AUTHORITY), new Object());
        assertFalse(result.isGranted());
        // Sanity check the strict-equality semantics — hasRole("USER") must not be granted by
        // an ROLE_ADMIN authority.
        assertEquals(false, result.isGranted());
    }

    private static Supplier<Authentication> supplier(Authentication a) {
        return () -> a;
    }
}
