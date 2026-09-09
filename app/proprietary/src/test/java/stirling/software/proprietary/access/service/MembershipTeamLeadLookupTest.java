package stirling.software.proprietary.access.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

@ExtendWith(MockitoExtension.class)
class MembershipTeamLeadLookupTest {

    @Mock private TeamMembershipRepository memberships;

    @InjectMocks private MembershipTeamLeadLookup lookup;

    @Test
    void leaderMembershipMakesTeamLeader() {
        when(memberships.existsByTeamIdAndUserIdAndRole(7L, 5L, TeamRole.LEADER)).thenReturn(true);
        assertThat(lookup.isLeaderOfTeam(user(5), 7L)).isTrue();
    }

    @Test
    void memberOnlyIsNotTeamLeader() {
        when(memberships.existsByTeamIdAndUserIdAndRole(7L, 5L, TeamRole.LEADER)).thenReturn(false);
        assertThat(lookup.isLeaderOfTeam(user(5), 7L)).isFalse();
    }

    @Test
    void anyLeadershipDetectedAcrossTeams() {
        when(memberships.existsByUserIdAndRole(5L, TeamRole.LEADER)).thenReturn(true);
        assertThat(lookup.isAnyTeamLeader(user(5))).isTrue();
    }

    @Test
    void nullInputsNeverQueryAndDeny() {
        assertThat(lookup.isAnyTeamLeader(null)).isFalse();
        assertThat(lookup.isLeaderOfTeam(null, 7L)).isFalse();
        assertThat(lookup.isLeaderOfTeam(user(5), null)).isFalse();
        verifyNoInteractions(memberships);
    }

    private User user(long id) {
        User u = new User();
        u.setId(id);
        return u;
    }
}
