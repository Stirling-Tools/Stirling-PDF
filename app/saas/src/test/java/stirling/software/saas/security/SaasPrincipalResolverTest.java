package stirling.software.saas.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.access.model.PrincipalRef;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;

class SaasPrincipalResolverTest {

    private final SaasPrincipalResolver resolver = new SaasPrincipalResolver();

    @Test
    void projectsUserAndTeamOnlyNeverOrg() {
        User u = new User();
        u.setId(5L);
        Team t = new Team();
        t.setId(7L);
        u.setTeam(t);

        assertThat(resolver.principalsOf(u))
                .containsExactlyInAnyOrder(PrincipalRef.user(5L), PrincipalRef.team(7L));
    }

    @Test
    void userWithoutTeamProjectsUserOnly() {
        User u = new User();
        u.setId(5L);

        assertThat(resolver.principalsOf(u)).containsExactly(PrincipalRef.user(5L));
    }

    @Test
    void nullUserProjectsNothing() {
        assertThat(resolver.principalsOf(null)).isEmpty();
    }
}
