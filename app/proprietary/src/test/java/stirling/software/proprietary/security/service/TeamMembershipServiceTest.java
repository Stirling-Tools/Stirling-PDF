package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

@ExtendWith(MockitoExtension.class)
class TeamMembershipServiceTest {

    @Mock private TeamMembershipRepository membershipRepository;
    @Mock private org.springframework.core.env.Environment environment;

    @InjectMocks private TeamMembershipService service;

    @org.junit.jupiter.api.BeforeEach
    void notSaas() {
        org.mockito.Mockito.lenient()
                .when(environment.getActiveProfiles())
                .thenReturn(new String[] {});
    }

    @Test
    void syncCreatesMemberRowForUsersTeam() {
        User user = userInTeam(5, 7);
        when(membershipRepository.findByUserId(5L)).thenReturn(List.of());

        service.syncMembership(user);

        ArgumentCaptor<TeamMembership> captor = ArgumentCaptor.forClass(TeamMembership.class);
        verify(membershipRepository).save(captor.capture());
        assertThat(captor.getValue().getTeam().getId()).isEqualTo(7L);
        assertThat(captor.getValue().getRole()).isEqualTo(TeamRole.MEMBER);
        assertThat(captor.getValue().getInvitedAt()).isNotNull();
    }

    @Test
    void syncMovesRowsWhenUserChangedTeam() {
        User user = userInTeam(5, 8);
        TeamMembership oldRow = row(7, user, TeamRole.LEADER);
        when(membershipRepository.findByUserId(5L)).thenReturn(List.of(oldRow));

        service.syncMembership(user);

        verify(membershipRepository).delete(oldRow);
        ArgumentCaptor<TeamMembership> captor = ArgumentCaptor.forClass(TeamMembership.class);
        verify(membershipRepository).save(captor.capture());
        assertThat(captor.getValue().getTeam().getId()).isEqualTo(8L);
        assertThat(captor.getValue().getRole()).isEqualTo(TeamRole.MEMBER);
    }

    @Test
    void syncPreservesLeaderRoleOnSameTeam() {
        User user = userInTeam(5, 7);
        TeamMembership existing = row(7, user, TeamRole.LEADER);
        when(membershipRepository.findByUserId(5L)).thenReturn(List.of(existing));

        service.syncMembership(user);

        verify(membershipRepository, never()).delete(any());
        verify(membershipRepository, never()).save(any());
    }

    @Test
    void syncRemovesAllRowsWhenUserHasNoTeam() {
        User user = new User();
        user.setId(5L);
        TeamMembership stale = row(7, user, TeamRole.MEMBER);
        when(membershipRepository.findByUserId(5L)).thenReturn(List.of(stale));

        service.syncMembership(user);

        verify(membershipRepository).delete(stale);
        verify(membershipRepository, never()).save(any());
    }

    @Test
    void setOwnerPromotesExistingRow() {
        User user = userInTeam(5, 7);
        TeamMembership existing = row(7, user, TeamRole.MEMBER);
        when(membershipRepository.findByTeamIdAndUserId(7L, 5L)).thenReturn(Optional.of(existing));

        service.setOwner(user.getTeam(), user);

        assertThat(existing.getRole()).isEqualTo(TeamRole.LEADER);
        verify(membershipRepository).save(existing);
    }

    @Test
    void setOwnerCreatesLeaderRowWhenMissing() {
        User user = userInTeam(5, 7);
        when(membershipRepository.findByTeamIdAndUserId(7L, 5L)).thenReturn(Optional.empty());

        service.setOwner(user.getTeam(), user);

        ArgumentCaptor<TeamMembership> captor = ArgumentCaptor.forClass(TeamMembership.class);
        verify(membershipRepository).save(captor.capture());
        assertThat(captor.getValue().getRole()).isEqualTo(TeamRole.LEADER);
    }

    @Test
    void removeOwnerDemotesToMemberAndKeepsRow() {
        User user = userInTeam(5, 7);
        TeamMembership existing = row(7, user, TeamRole.LEADER);
        when(membershipRepository.findByTeamIdAndUserId(7L, 5L)).thenReturn(Optional.of(existing));

        service.removeOwner(user.getTeam(), user);

        assertThat(existing.getRole()).isEqualTo(TeamRole.MEMBER);
        verify(membershipRepository).save(existing);
        verify(membershipRepository, never()).delete(any());
    }

    @Test
    void deleteAllForUserDropsRowsAndInvitationRefs() {
        User user = userInTeam(5, 7);

        service.deleteAllForUser(user);

        verify(membershipRepository).deleteByUserId(5L);
        verify(membershipRepository).clearInvitedBy(user);
    }

    private User userInTeam(long userId, long teamId) {
        User u = new User();
        u.setId(userId);
        Team t = new Team();
        t.setId(teamId);
        u.setTeam(t);
        return u;
    }

    private TeamMembership row(long teamId, User user, TeamRole role) {
        Team t = new Team();
        t.setId(teamId);
        TeamMembership m = new TeamMembership();
        m.setTeam(t);
        m.setUser(user);
        m.setRole(role);
        return m;
    }
}
