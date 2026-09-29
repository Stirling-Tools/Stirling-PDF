package stirling.software.saas.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

@ExtendWith(MockitoExtension.class)
class UserTeamResolverTest {

    @Mock private TeamMembershipRepository membershipRepository;

    private UserTeamResolver resolver;

    @BeforeEach
    void setUp() {
        resolver = new UserTeamResolver(membershipRepository);
    }

    /** The id comes straight off the eager association, so it must cost no query. */
    @Test
    void teamIdReadsTheForeignKeyWithoutQuerying() {
        assertThat(resolver.teamId(user(1L, 100L))).contains(100L);
        verifyNoInteractions(membershipRepository);
    }

    @Test
    void teamIdIsEmptyWithoutATeamOrAUser() {
        assertThat(resolver.teamId(user(2L, null))).isEmpty();
        assertThat(resolver.teamId(null)).isEmpty();
        verifyNoInteractions(membershipRepository);
    }

    /**
     * The behaviour the fix exists for: a joined member. users.team_id is the joined team, and the
     * role is read from the joined team's row — not from the older home-team membership a join
     * leaves in place.
     */
    @Test
    void resolvesTheJoinedTeamAndItsRole() {
        User joined = user(3L, 200L);
        when(membershipRepository.findByTeamIdAndUserId(200L, 3L))
                .thenReturn(Optional.of(membership(TeamRole.MEMBER)));

        assertThat(resolver.teamId(joined)).contains(200L);
        // MEMBER of the joined team, not LEADER of the home team a join leaves behind.
        assertThat(resolver.isLeader(joined)).isFalse();
    }

    @Test
    void isLeaderWhenTheBillingTeamsRowSaysSo() {
        User leader = user(4L, 400L);
        when(membershipRepository.findByTeamIdAndUserId(400L, 4L))
                .thenReturn(Optional.of(membership(TeamRole.LEADER)));

        assertThat(resolver.isLeader(leader)).isTrue();
    }

    /** A dangling users.team_id: no role, so no leader powers. */
    @Test
    void noRoleWhenTheTeamHasNoMembershipRow() {
        User dangling = user(5L, 500L);
        when(membershipRepository.findByTeamIdAndUserId(500L, 5L)).thenReturn(Optional.empty());

        assertThat(resolver.isLeader(dangling)).isFalse();
        // The team is still reported, so reads stay in step with the enforcement layer.
        assertThat(resolver.teamId(dangling)).contains(500L);
    }

    @Test
    void neverALeaderWithoutATeam() {
        assertThat(resolver.isLeader(user(6L, null))).isFalse();
        assertThat(resolver.isLeader(null)).isFalse();
        verifyNoInteractions(membershipRepository);
    }

    private static User user(long id, Long teamId) {
        User u = new User();
        u.setId(id);
        if (teamId != null) {
            Team t = new Team();
            t.setId(teamId);
            u.setTeam(t);
        }
        return u;
    }

    private static TeamMembership membership(TeamRole role) {
        TeamMembership m = new TeamMembership();
        m.setRole(role);
        return m;
    }
}
