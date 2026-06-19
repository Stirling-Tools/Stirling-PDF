package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.common.model.enumeration.InvitationStatus;
import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.saas.accountlink.LinkedInstanceRepository;
import stirling.software.saas.model.TeamInvitation;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.SaasTeamExtensionsRepository;
import stirling.software.saas.repository.TeamInvitationRepository;
import stirling.software.saas.repository.TeamMembershipRepository;

/**
 * Unit tests for {@link SaasTeamService}'s orphan guard against linked self-hosted instances.
 *
 * <p>The guard ({@code assertCanLeaveCurrentTeamsToJoinAnother}) is private; it's exercised through
 * its only caller, {@link SaasTeamService#acceptInvitation}, up to the point where a team with
 * active linked instances must block the move. {@link Strictness#LENIENT} because the pass-through
 * case stubs the full leave/join path while the blocking case short-circuits early.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SaasTeamServiceTest {

    private static final long USER_ID = 7L;
    private static final long OLD_TEAM_ID = 100L;
    private static final long NEW_TEAM_ID = 200L;
    private static final String TOKEN = "tok-1";
    private static final String EMAIL = "joiner@example.com";

    @Mock private TeamRepository teamRepository;
    @Mock private TeamMembershipRepository membershipRepository;
    @Mock private TeamInvitationRepository invitationRepository;
    @Mock private UserRepository userRepository;

    @Mock
    private stirling.software.saas.billing.repository.BillingSubscriptionRepository
            billingSubscriptionRepository;

    @Mock private org.springframework.web.client.RestTemplate restTemplate;
    @Mock private RateLimitService rateLimitService;
    @Mock private stirling.software.saas.config.SupabaseConfigurationProperties supabaseConfig;
    @Mock private UserRoleService userRoleService;
    @Mock private SaasTeamExtensionService saasTeamExtensionService;
    @Mock private SaasTeamExtensionsRepository saasTeamExtensionsRepository;
    @Mock private LinkedInstanceRepository linkedInstanceRepository;
    @Mock private stirling.software.proprietary.security.service.UserService userService;

    @InjectMocks private SaasTeamService service;

    @Test
    void acceptInvitation_blocksWhenCurrentTeamHasActiveLinkedInstances() {
        User joiner = user(USER_ID, EMAIL);
        Team oldTeam = team(OLD_TEAM_ID);
        Team newTeam = team(NEW_TEAM_ID);
        TeamInvitation invitation = pendingInvitation(newTeam, joiner);

        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(joiner));
        when(invitationRepository.findByInvitationToken(TOKEN)).thenReturn(Optional.of(invitation));
        when(saasTeamExtensionService.hasAvailableSeats(newTeam)).thenReturn(true);
        when(membershipRepository.findByUserId(USER_ID))
                .thenReturn(List.of(membership(oldTeam, joiner, TeamRole.LEADER)));
        when(linkedInstanceRepository.countByTeamIdAndRevokedAtIsNull(OLD_TEAM_ID)).thenReturn(1L);

        assertThatThrownBy(() -> service.acceptInvitation(TOKEN, joiner))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage(
                        "Revoke linked self-hosted instances on this team before joining another"
                                + " team.");

        // Guard fires before any team mutation.
        verify(membershipRepository, never()).delete(any());
        verify(userRepository, never()).updateUserTeamId(anyLong(), anyLong());
    }

    @Test
    void acceptInvitation_passesGuardWhenNoLinkedInstances() {
        User joiner = user(USER_ID, EMAIL);
        Team oldTeam = team(OLD_TEAM_ID);
        Team newTeam = team(NEW_TEAM_ID);
        TeamInvitation invitation = pendingInvitation(newTeam, joiner);
        TeamMembership oldMembership = membership(oldTeam, joiner, TeamRole.LEADER);

        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(joiner));
        when(invitationRepository.findByInvitationToken(TOKEN)).thenReturn(Optional.of(invitation));
        when(saasTeamExtensionService.hasAvailableSeats(newTeam)).thenReturn(true);
        when(membershipRepository.findByUserId(USER_ID)).thenReturn(List.of(oldMembership));
        when(linkedInstanceRepository.countByTeamIdAndRevokedAtIsNull(OLD_TEAM_ID)).thenReturn(0L);
        // Personal old team → guard skips the last-leader check and leave/join proceeds.
        when(saasTeamExtensionService.isPersonal(oldTeam)).thenReturn(true);
        when(membershipRepository.countByTeamId(OLD_TEAM_ID)).thenReturn(0L);
        when(saasTeamExtensionsRepository.incrementSeatsUsed(NEW_TEAM_ID)).thenReturn(1);

        service.acceptInvitation(TOKEN, joiner);

        // Guard let the move through: the old membership was actually left and the user re-pointed.
        verify(membershipRepository).delete(oldMembership);
        verify(userRepository).updateUserTeamId(USER_ID, NEW_TEAM_ID);
        verify(invitationRepository).save(invitation);
        assertThat(invitation.getStatus()).isEqualTo(InvitationStatus.ACCEPTED);
    }

    // -----------------------------------------------------------------------------------------
    // Fixtures
    // -----------------------------------------------------------------------------------------

    private static User user(long id, String email) {
        User u = new User();
        u.setId(id);
        u.setEmail(email);
        u.setUsername(email);
        return u;
    }

    private static Team team(long id) {
        Team t = new Team();
        t.setId(id);
        t.setName("team-" + id);
        return t;
    }

    private static TeamMembership membership(Team team, User user, TeamRole role) {
        TeamMembership m = new TeamMembership();
        m.setTeam(team);
        m.setUser(user);
        m.setRole(role);
        return m;
    }

    private static TeamInvitation pendingInvitation(Team team, User invitee) {
        TeamInvitation inv = new TeamInvitation();
        inv.setTeam(team);
        inv.setInviter(invitee);
        inv.setInviteeEmail(invitee.getEmail());
        inv.setStatus(InvitationStatus.PENDING);
        inv.setInvitationToken(TOKEN);
        inv.setExpiresAt(LocalDateTime.now().plusDays(1));
        return inv;
    }
}
