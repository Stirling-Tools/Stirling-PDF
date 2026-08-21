package stirling.software.saas.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;
import org.springframework.security.access.expression.SecurityExpressionRoot;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authorization.AuthorityAuthorizationManager;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/**
 * Settles the "did our admin endpoints ever actually work?" question.
 *
 * <p>Two code paths share the {@code hasRole(...)} spelling but behave differently in Spring
 * Security 6/7:
 *
 * <ol>
 *   <li>{@link AuthorityAuthorizationManager#hasRole(String)} — used by the servlet-side {@code
 *       .requestMatchers(...).hasRole(...)} chain. Throws {@code IllegalArgumentException} if you
 *       pass a role that already starts with the default {@code ROLE_} prefix.
 *   <li>{@link SecurityExpressionRoot#hasRole(String)} — used by
 *       {@code @PreAuthorize("hasRole(...)")} SpEL expressions. Silently de-duplicates the prefix:
 *       if the argument already starts with {@code ROLE_} it's used as-is, otherwise the prefix is
 *       prepended.
 * </ol>
 *
 * <p>The OSS proprietary module has used {@code @PreAuthorize("hasRole('ROLE_ADMIN')")} for years
 * across hundreds of admin endpoints. Those have always worked because path (2) tolerates the
 * redundant prefix. The earlier "fix" in this PR was a stylistic normalisation, not a correctness
 * fix — both forms produce identical behaviour at the @PreAuthorize call site.
 */
class PreAuthorizeHasRoleTest {

    private static final Authentication ADMIN_AUTH =
            new UsernamePasswordAuthenticationToken(
                    "alice", "pw", List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));

    // ---------- Path (2): SpEL via @PreAuthorize ----------

    @Test
    void spelHasRole_with_ROLE_ADMIN_matches_authority_ROLE_ADMIN() {
        SecurityExpressionRoot root = newRoot(ADMIN_AUTH);
        // This is exactly what `@PreAuthorize("hasRole('ROLE_ADMIN')")` evaluates internally.
        assertTrue(
                root.hasRole("ROLE_ADMIN"),
                "SecurityExpressionRoot tolerates the redundant prefix — this is why every"
                        + " @PreAuthorize(\"hasRole('ROLE_ADMIN')\") in :proprietary has worked"
                        + " for years.");
    }

    @Test
    void spelHasRole_with_bare_ADMIN_also_matches_authority_ROLE_ADMIN() {
        SecurityExpressionRoot root = newRoot(ADMIN_AUTH);
        assertTrue(root.hasRole("ADMIN"), "Standard form also works.");
    }

    @Test
    void spelHasRole_with_unrelated_role_denies() {
        SecurityExpressionRoot root = newRoot(ADMIN_AUTH);
        assertFalse(root.hasRole("EDITOR"));
        assertFalse(root.hasRole("ROLE_EDITOR"));
    }

    // ---------- Path (1): AuthorityAuthorizationManager (servlet matchers) ----------

    @Test
    void httpAuthorizationManager_hasRole_with_ROLE_ADMIN_throws() {
        // Different code path: the one used by .requestMatchers(...).hasRole(...) on the security
        // filter chain. THIS is strict and the source of the IllegalArgumentException I caught
        // earlier — but no @PreAuthorize site uses this manager.
        try {
            AuthorityAuthorizationManager<Object> mgr =
                    AuthorityAuthorizationManager.hasRole("ROLE_ADMIN");
            AuthorizationResult result = mgr.authorize(() -> ADMIN_AUTH, new Object());
            // If it ever stops throwing, ensure it doesn't silently accept either.
            assertFalse(
                    result.isGranted(),
                    "AuthorityAuthorizationManager either throws on redundant prefix or denies"
                            + " ROLE_ROLE_ADMIN");
        } catch (IllegalArgumentException expected) {
            assertTrue(
                    expected.getMessage().contains("ROLE_")
                            || expected.getMessage().toLowerCase().contains("prefix"),
                    "Expected redundant-prefix IAE, got: " + expected.getMessage());
        }
    }

    @Test
    void httpAuthorizationManager_hasRole_with_bare_ADMIN_matches() {
        AuthorityAuthorizationManager<Object> mgr = AuthorityAuthorizationManager.hasRole("ADMIN");
        assertTrue(mgr.authorize(() -> ADMIN_AUTH, new Object()).isGranted());
    }

    // ---------- Helpers ----------

    private static SecurityExpressionRoot newRoot(Authentication a) {
        // SecurityExpressionRoot is abstract; the concrete subclass used at runtime is
        // MethodSecurityExpressionRoot. Build a minimal stand-in that gives us the exact same
        // hasRole/hasAuthority implementation.
        Supplier<Authentication> auth = () -> a;
        return new SecurityExpressionRoot(auth) {};
    }
}
