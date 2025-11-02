package stirling.software.proprietary.security.model;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.model.Team;

class AuthorityTest {

    @Test
    void noArgsConstructor_allowsSettersAndGetters() {
        Authority a = new Authority();
        assertNull(a.getId());
        assertNull(a.getAuthority());
        assertNull(a.getUser());

        a.setId(42L);
        a.setAuthority("ROLE_USER");
        User u = new User();
        a.setUser(u);

        assertEquals(42L, a.getId());
        assertEquals("ROLE_USER", a.getAuthority());
        assertSame(u, a.getUser());
    }

    @Test
    void ctorWithUser_setsFields_and_registersInUserAuthorities() {
        User u = new User();
        // sanity: authorities set initialized?
        assertNotNull(u.getAuthorities());
        assertTrue(u.getAuthorities().isEmpty());

        Authority a = new Authority("ROLE_ADMIN", u);

        assertEquals("ROLE_ADMIN", a.getAuthority());
        assertSame(u, a.getUser());
        assertTrue(u.getAuthorities().contains(a), "Authority should be registered in user's set");
        assertEquals(1, u.getAuthorities().size());
    }

    @Test
    void multipleAuthorities_registerEachInUser() {
        User u = new User();

        Authority a1 = new Authority("ROLE_A", u);
        Authority a2 = new Authority("ROLE_B", u);

        assertTrue(u.getAuthorities().contains(a1));
        assertTrue(u.getAuthorities().contains(a2));
        assertEquals(2, u.getAuthorities().size());
    }

    @Test
    void ctorWithNullUser_throwsNpe_dueToRegistrationInUserSet() {
        assertThrows(
                NullPointerException.class,
                () -> new Authority("ROLE_X", null),
                "Constructor calls user.getAuthorities() and should throw NPE when null");
    }

    @Test
    void setUser_doesNotAutoRegisterInUserAuthorities_currentBehavior() {
        User u = new User();
        Authority a = new Authority();
        a.setAuthority("ROLE_VIEWER");

        // only using the setter → no automatic entry in the user's set
        a.setUser(u);

        assertSame(u, a.getUser());
        assertTrue(
                u.getAuthorities().isEmpty(),
                "Current behavior: setUser() does not automatically register in user's set");
    }

    @Test
    void toString_equalsHashCode_fromLombok_defaultObjectSemantics() {
        // no @EqualsAndHashCode annotation -> default Object semantics
        Authority a1 = new Authority();
        Authority a2 = new Authority();
        assertNotEquals(a1, a2);
        assertNotEquals(a1.hashCode(), a2.hashCode());
        assertNotNull(a1);
    }

    // Optional: shows that User has other fields that don't interfere
    @Test
    void worksWithUserHavingTeamField() {
        User u = new User();
        u.setTeam(new Team()); // just to show that it has no effect
        Authority a = new Authority("ROLE_TEST", u);
        assertTrue(u.getAuthorities().contains(a));
    }
}
