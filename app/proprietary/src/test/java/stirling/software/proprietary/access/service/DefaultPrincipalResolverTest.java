package stirling.software.proprietary.access.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.access.model.PrincipalRef;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;

class DefaultPrincipalResolverTest {

    private final DefaultPrincipalResolver resolver = new DefaultPrincipalResolver(1L);

    @Test
    void userWithoutTeamProjectsUserAndOrg() {
        assertThat(resolver.principalsOf(user(5, null)))
                .containsExactlyInAnyOrder(PrincipalRef.user(5L), PrincipalRef.org(1L));
    }

    @Test
    void userWithTeamProjectsUserTeamAndOrg() {
        assertThat(resolver.principalsOf(user(5, 7L)))
                .containsExactlyInAnyOrder(
                        PrincipalRef.user(5L), PrincipalRef.team(7L), PrincipalRef.org(1L));
    }

    @Test
    void nullUserProjectsNothing() {
        assertThat(resolver.principalsOf(null)).isEmpty();
        assertThat(resolver.principalTokens(null)).isEmpty();
    }

    @Test
    void tokensUseTheCanonicalWireForm() {
        assertThat(resolver.principalTokens(user(5, 7L)))
                .containsExactlyInAnyOrder("user:5", "team:7", "org:1");
    }

    private User user(long id, Long teamId) {
        User u = new User();
        u.setId(id);
        if (teamId != null) {
            Team t = new Team();
            t.setId(teamId);
            u.setTeam(t);
        }
        return u;
    }
}
