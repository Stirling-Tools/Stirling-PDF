package stirling.software.proprietary.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import stirling.software.common.model.enumeration.Role;

class PrincipalPolicyTest {

    private final PrincipalPolicy policy = new PrincipalPolicy();

    @Test
    void rejectsNullAuthentication() {
        assertFalse(policy.isHumanUser(null));
    }

    @Test
    void doesNotTreatMissingAuthenticationAsInternal() {
        assertFalse(policy.isInternalApiUser(null));
    }

    @Test
    void rejectsUnauthenticatedAuthentication() {
        Authentication authentication =
                new UsernamePasswordAuthenticationToken("peter", "password");

        assertFalse(policy.isHumanUser(authentication));
    }

    @Test
    void rejectsAnonymousAuthentication() {
        Authentication authentication =
                new AnonymousAuthenticationToken(
                        "test-key",
                        "anonymousUser",
                        List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));

        assertFalse(policy.isHumanUser(authentication));
    }

    @Test
    void acceptsAuthenticatedHumanUser() {
        assertTrue(policy.isHumanUser(authenticated("peter")));
    }

    @Test
    void acceptsAuthenticatedAdminUser() {
        Authentication authentication =
                authenticated("admin", new SimpleGrantedAuthority(Role.ADMIN.getRoleId()));

        assertTrue(policy.isHumanUser(authentication));
    }

    @Test
    void rejectsInternalApiAuthorityEvenWithHumanUsername() {
        Authentication authentication =
                authenticated(
                        "peter", new SimpleGrantedAuthority(Role.INTERNAL_API_USER.getRoleId()));

        assertTrue(policy.isInternalApiUser(authentication));
        assertFalse(policy.isHumanUser(authentication));
    }

    @Test
    void rejectsInternalApiUsernameEvenWithoutAuthority() {
        Authentication authentication = authenticated(Role.INTERNAL_API_USER.getRoleId());

        assertTrue(policy.isInternalApiUser(authentication));
        assertFalse(policy.isHumanUser(authentication));
    }

    @Test
    void rejectsInternalAuthorityWhenCombinedWithOtherAuthorities() {
        Authentication authentication =
                authenticated(
                        "peter",
                        new SimpleGrantedAuthority(Role.USER.getRoleId()),
                        new SimpleGrantedAuthority(Role.INTERNAL_API_USER.getRoleId()));

        assertFalse(policy.isHumanUser(authentication));
    }

    private static Authentication authenticated(
            String username, SimpleGrantedAuthority... authorities) {
        return new UsernamePasswordAuthenticationToken(username, "password", List.of(authorities));
    }
}
