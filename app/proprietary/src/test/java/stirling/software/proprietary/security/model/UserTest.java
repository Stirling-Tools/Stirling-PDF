package stirling.software.proprietary.security.model;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.times;

import java.util.LinkedHashSet;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.Team;

class UserTest {

    @Test
    void defaults_collections_initialized() {
        User u = new User();
        assertNotNull(u.getAuthorities(), "authorities should be initialized");
        assertTrue(u.getAuthorities().isEmpty());
        assertNotNull(u.getSettings(), "settings should be initialized");
        assertTrue(u.getSettings().isEmpty());
        assertNull(u.getTeam());
    }

    @Test
    void addAuthority_adds_to_set_but_doesNot_set_backref_on_authority() {
        User u = new User();

        Authority a = new Authority();
        a.setAuthority("ROLE_A");

        u.addAuthority(a);

        assertTrue(u.getAuthorities().contains(a));
        // current behavior: addAuthority() does NOT call a.setUser(u)
        assertNull(
                a.getUser(), "Current behavior: Authority.user is NOT set by User.addAuthority()");
    }

    @Test
    void addAuthorities_adds_all() {
        User u = new User();

        Authority a1 = new Authority();
        a1.setAuthority("ROLE_A");
        Authority a2 = new Authority();
        a2.setAuthority("ROLE_B");

        Set<Authority> batch = new LinkedHashSet<>();
        batch.add(a1);
        batch.add(a2);

        u.addAuthorities(batch);

        assertEquals(2, u.getAuthorities().size());
        assertTrue(u.getAuthorities().contains(a1));
        assertTrue(u.getAuthorities().contains(a2));
    }

    @Test
    void getRolesAsString_returns_roles_joined_order_agnostic() {
        User u = new User();

        // We use the Authority constructor that automatically adds itself to u.getAuthorities()
        new Authority("ROLE_USER", u);
        new Authority("ROLE_ADMIN", u);

        String roles = u.getRolesAsString();
        // Order is not guaranteed due to HashSet -> split/trim and compare as a Set
        Set<String> parts =
                java.util.Arrays.stream(roles.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .collect(java.util.stream.Collectors.toSet());

        assertEquals(Set.of("ROLE_USER", "ROLE_ADMIN"), parts);
    }

    @Test
    void hasPassword_null_empty_and_present() {
        User u = new User();
        u.setPassword(null);
        assertFalse(u.hasPassword());

        u.setPassword("");
        assertFalse(u.hasPassword());

        u.setPassword("secret");
        assertTrue(u.hasPassword());
    }

    @Test
    void isFirstLogin_handles_null_false_true() {
        User u = new User();

        // Default is Boolean false (according to field initialization)
        assertFalse(u.isFirstLogin());

        u.setFirstLogin(true);
        assertTrue(u.isFirstLogin());

        // explicitly null -> method returns false
        u.setIsFirstLogin(null);
        assertFalse(u.isFirstLogin());
    }

    @Test
    void setAuthenticationType_lowercases_enum_name() {
        User u = new User();

        // Use an existing value from your AuthenticationType enum (e.g. OAUTH2/SAML2/DATABASE)
        // If the name differs, simply adjust below.
        AuthenticationType at = AuthenticationType.SSO;
        u.setAuthenticationType(at);

        assertEquals("sso", u.getAuthenticationType());
    }

    @Test
    void team_setter_getter() {
        User u = new User();
        Team t = new Team();
        u.setTeam(t);
        assertSame(t, u.getTeam());
    }

    @Test
    void getRoleName_delegatesToRole_withRolesAsString() {
        User u = new User();

        // Add authorities (order in HashSet doesn't matter)
        new Authority("ROLE_USER", u);
        new Authority("ROLE_ADMIN", u);

        // Expected argument created exactly as getRoleName() does internally
        String expectedArg = u.getRolesAsString();

        try (MockedStatic<Role> roleMock = mockStatic(Role.class)) {
            roleMock.when(() -> Role.getRoleNameByRoleId(expectedArg)).thenReturn("Friendly Name");

            String result = u.getRoleName();

            assertEquals("Friendly Name", result);

            // Verify it was delegated exactly with the expected string
            roleMock.verify(() -> Role.getRoleNameByRoleId(expectedArg), times(1));
        }
    }
}
