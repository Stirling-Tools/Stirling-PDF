package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.common.model.enumeration.InvitationStatus;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.saas.accountlink.LinkedInstanceRepository;
import stirling.software.saas.billing.repository.BillingSubscriptionRepository;
import stirling.software.saas.config.SupabaseConfigurationProperties;
import stirling.software.saas.model.TeamInvitation;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.SaasTeamExtensionsRepository;
import stirling.software.saas.repository.TeamInvitationRepository;
import stirling.software.saas.repository.TeamMembershipRepository;

/**
 * Unit tests for {@link SaasTeamService}.
 *
 * <p>The service orchestrates SaaS team lifecycle: personal-team creation, invitations,
 * accept/leave flows, seat caps and paid-subscription gating. Every collaborator is mocked, so the
 * tests exercise the service's own branching - null guards, early returns, security/permission
 * throws, seat-cap enforcement and subscription-gated role grants - with no DB or network.
 */
@ExtendWith(MockitoExtension.class)
class SaasTeamServiceTest {

    @Mock private TeamRepository teamRepository;
    @Mock private TeamMembershipRepository membershipRepository;
    @Mock private TeamInvitationRepository invitationRepository;
    @Mock private UserRepository userRepository;
    @Mock private BillingSubscriptionRepository billingSubscriptionRepository;
    @Mock private org.springframework.web.client.RestTemplate restTemplate;
    @Mock private RateLimitService rateLimitService;
    @Mock private SupabaseConfigurationProperties supabaseConfig;
    @Mock private UserRoleService userRoleService;
    @Mock private SaasTeamExtensionService saasTeamExtensionService;
    @Mock private SaasTeamExtensionsRepository saasTeamExtensionsRepository;
    @Mock private LinkedInstanceRepository linkedInstanceRepository;
    @Mock private stirling.software.proprietary.security.service.UserService userService;

    @InjectMocks private SaasTeamService service;

    private static final UUID SUPABASE_ID = UUID.fromString("11111111-2222-3333-4444-555555555555");

    // ---- fixtures -------------------------------------------------------------------------------

    private static Team team(Long id, String name) {
        Team t = new Team();
        t.setId(id);
        t.setName(name);
        return t;
    }

    private static User user(Long id, String email, String username) {
        User u = new User();
        u.setId(id);
        u.setEmail(email);
        u.setUsername(username);
        return u;
    }

    private static User proUser(Long id, String email, String username) {
        User u = user(id, email, username);
        // Authority ctor self-registers on the user, so getRolesAsString() returns ROLE_PRO_USER.
        new Authority(Role.PRO_USER.getRoleId(), u);
        return u;
    }

    private static TeamMembership membership(Team team, User user, TeamRole role) {
        TeamMembership m = new TeamMembership();
        m.setTeam(team);
        m.setUser(user);
        m.setRole(role);
        return m;
    }

    // =============================================================================================
    @Nested
    @DisplayName("ensurePersonalTeam")
    class EnsurePersonalTeam {

        @Test
        @DisplayName("returns the existing team when the user already has a personal one")
        void existingPersonalTeam_returnedAsIs() {
            User u = user(1L, "a@x.com", "alice");
            Team existing = team(10L, "My Team");
            u.setTeam(existing);
            when(saasTeamExtensionService.isPersonal(existing)).thenReturn(true);

            Team result = service.ensurePersonalTeam(u);

            assertThat(result).isSameAs(existing);
            // No new team is created.
            verify(teamRepository, never()).save(any());
        }

        @Test
        @DisplayName("creates a personal team when the user's team is non-personal")
        void nonPersonalTeam_createsNew() {
            User u = user(1L, "a@x.com", "alice");
            Team existing = team(10L, "Acme");
            u.setTeam(existing);
            when(saasTeamExtensionService.isPersonal(existing)).thenReturn(false);
            stubCreatePersonalTeam(u, 99L);

            Team result = service.ensurePersonalTeam(u);

            assertThat(result.getId()).isEqualTo(99L);
            verify(teamRepository).save(any(Team.class));
        }

        @Test
        @DisplayName("creates a personal team when the user has no team at all")
        void noTeam_createsNew() {
            User u = user(1L, "a@x.com", "alice");
            stubCreatePersonalTeam(u, 99L);

            Team result = service.ensurePersonalTeam(u);

            assertThat(result.getId()).isEqualTo(99L);
            verify(membershipRepository).save(any(TeamMembership.class));
        }
    }

    // =============================================================================================
    @Nested
    @DisplayName("createPersonalTeam")
    class CreatePersonalTeam {

        @Test
        @DisplayName("builds a 'My Team', wires extensions, membership and user team-ref")
        void happyPath() {
            User u = user(1L, "a@x.com", "alice");
            when(userRepository.findById(1L)).thenReturn(Optional.of(u));
            Team saved = team(50L, "My Team");
            when(teamRepository.save(any(Team.class))).thenReturn(saved);

            Team result = service.createPersonalTeam(u);

            assertThat(result).isSameAs(saved);
            verify(saasTeamExtensionService).setPersonal(saved, true);
            verify(saasTeamExtensionService).setSeats(saved, 1, 1);
            verify(saasTeamExtensionService).setCreatedByUserId(saved, 1L);
            verify(saasTeamExtensionsRepository).incrementSeatsUsed(50L);

            ArgumentCaptor<TeamMembership> mcap = ArgumentCaptor.forClass(TeamMembership.class);
            verify(membershipRepository).save(mcap.capture());
            assertThat(mcap.getValue().getRole()).isEqualTo(TeamRole.LEADER);
            assertThat(mcap.getValue().getAcceptedAt()).isNotNull();
            verify(userRepository).save(u);
        }

        @Test
        @DisplayName("throws IllegalArgumentException when the user no longer exists")
        void userNotFound_throws() {
            User u = user(7L, "a@x.com", "alice");
            when(userRepository.findById(7L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.createPersonalTeam(u))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("User not found: 7");
            verify(teamRepository, never()).save(any());
        }

        @Test
        @DisplayName("cleans up the old Default team membership when migrating off it")
        void migratingOffDefaultTeam_deletesOldMembership() {
            User u = user(1L, "a@x.com", "alice");
            Team oldTeam = team(2L, SaasTeamService.DEFAULT_TEAM_NAME);
            u.setTeam(oldTeam);
            when(userRepository.findById(1L)).thenReturn(Optional.of(u));
            when(teamRepository.save(any(Team.class))).thenReturn(team(50L, "My Team"));

            service.createPersonalTeam(u);

            verify(membershipRepository).deleteByTeamIdAndUserId(2L, 1L);
        }

        @Test
        @DisplayName("cleans up the old Internal team membership when migrating off it")
        void migratingOffInternalTeam_deletesOldMembership() {
            User u = user(1L, "a@x.com", "alice");
            Team oldTeam = team(3L, SaasTeamService.INTERNAL_TEAM_NAME);
            u.setTeam(oldTeam);
            when(userRepository.findById(1L)).thenReturn(Optional.of(u));
            when(teamRepository.save(any(Team.class))).thenReturn(team(50L, "My Team"));

            service.createPersonalTeam(u);

            verify(membershipRepository).deleteByTeamIdAndUserId(3L, 1L);
        }

        @Test
        @DisplayName("does not delete membership when the old team is a regular (non-system) team")
        void migratingOffRegularTeam_keepsOldMembership() {
            User u = user(1L, "a@x.com", "alice");
            Team oldTeam = team(4L, "Some Other Team");
            u.setTeam(oldTeam);
            when(userRepository.findById(1L)).thenReturn(Optional.of(u));
            when(teamRepository.save(any(Team.class))).thenReturn(team(50L, "My Team"));

            service.createPersonalTeam(u);

            verify(membershipRepository, never()).deleteByTeamIdAndUserId(anyLong(), anyLong());
        }
    }

    // =============================================================================================
    @Nested
    @DisplayName("inviteUserToTeam")
    class InviteUserToTeam {

        private final Long teamId = 100L;

        @Test
        @DisplayName("throws when the team does not exist")
        void teamNotFound_throws() {
            when(teamRepository.findById(teamId)).thenReturn(Optional.empty());

            assertThatThrownBy(
                            () ->
                                    service.inviteUserToTeam(
                                            teamId, "b@x.com", user(1L, "a@x.com", "alice")))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Team not found");
        }

        @Test
        @DisplayName("throws SecurityException when the inviter is not a member of the team")
        void inviterNotMember_throws() {
            Team t = team(teamId, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.inviteUserToTeam(teamId, "b@x.com", inviter))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("not a member");
        }

        @Test
        @DisplayName("throws SecurityException when the inviter is a member but not a leader")
        void inviterNotLeader_throws() {
            Team t = team(teamId, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, inviter, TeamRole.MEMBER)));

            assertThatThrownBy(() -> service.inviteUserToTeam(teamId, "b@x.com", inviter))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("Only team leaders");
        }

        @Test
        @DisplayName("converts a personal team to standard (unlimited seats) on first invitation")
        void personalTeam_convertedToStandard() {
            Team t = team(teamId, "My Team");
            User inviter = user(1L, "a@x.com", "alice");
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, inviter, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(true);
            when(saasTeamExtensionService.canInviteMembers(t)).thenReturn(true);
            when(rateLimitService.allowInvitation(teamId)).thenReturn(true);
            when(invitationRepository.existsPendingInvitationByTeamIdAndEmail(teamId, "b@x.com"))
                    .thenReturn(false);
            when(userRepository.findByEmail("b@x.com")).thenReturn(Optional.empty());
            when(invitationRepository.save(any(TeamInvitation.class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            service.inviteUserToTeam(teamId, "b@x.com", inviter);

            verify(saasTeamExtensionService).setPersonal(t, false);
            verify(saasTeamExtensionService).setSeats(t, Integer.MAX_VALUE, Integer.MAX_VALUE);
        }

        @Test
        @DisplayName("throws when the team cannot invite members (no seats / still personal)")
        void cannotInvite_throws() {
            Team t = team(teamId, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, inviter, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(saasTeamExtensionService.canInviteMembers(t)).thenReturn(false);

            assertThatThrownBy(() -> service.inviteUserToTeam(teamId, "b@x.com", inviter))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Cannot invite members");
        }

        @Test
        @DisplayName("throws IllegalStateException with remaining count when rate-limited")
        void rateLimited_throws() {
            Team t = team(teamId, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, inviter, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(saasTeamExtensionService.canInviteMembers(t)).thenReturn(true);
            when(rateLimitService.allowInvitation(teamId)).thenReturn(false);
            when(rateLimitService.getRemainingInvitations(teamId)).thenReturn(0);

            assertThatThrownBy(() -> service.inviteUserToTeam(teamId, "b@x.com", inviter))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("Rate limit exceeded")
                    .hasMessageContaining("Remaining: 0");
        }

        @Test
        @DisplayName("throws when a pending invitation already exists for the email")
        void duplicatePendingInvite_throws() {
            Team t = team(teamId, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, inviter, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(saasTeamExtensionService.canInviteMembers(t)).thenReturn(true);
            when(rateLimitService.allowInvitation(teamId)).thenReturn(true);
            when(invitationRepository.existsPendingInvitationByTeamIdAndEmail(teamId, "b@x.com"))
                    .thenReturn(true);

            assertThatThrownBy(() -> service.inviteUserToTeam(teamId, "b@x.com", inviter))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Pending invitation already exists");
        }

        @Test
        @DisplayName("throws when the invitee already has an active paid subscription")
        void inviteePaidSubscriber_throws() {
            Team t = team(teamId, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            User invitee = user(2L, "b@x.com", "bob");
            invitee.setSupabaseId(SUPABASE_ID);
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, inviter, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(saasTeamExtensionService.canInviteMembers(t)).thenReturn(true);
            when(rateLimitService.allowInvitation(teamId)).thenReturn(true);
            when(invitationRepository.existsPendingInvitationByTeamIdAndEmail(teamId, "b@x.com"))
                    .thenReturn(false);
            when(userRepository.findByEmail("b@x.com")).thenReturn(Optional.of(invitee));
            when(billingSubscriptionRepository.existsActivePaidSubscriptionForUser(SUPABASE_ID))
                    .thenReturn(true);

            assertThatThrownBy(() -> service.inviteUserToTeam(teamId, "b@x.com", inviter))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Cannot invite paid users");
        }

        @Test
        @DisplayName("throws when the invitee is already a member of the team")
        void inviteeAlreadyMember_throws() {
            Team t = team(teamId, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            User invitee = user(2L, "b@x.com", "bob");
            invitee.setSupabaseId(SUPABASE_ID);
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, inviter, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(saasTeamExtensionService.canInviteMembers(t)).thenReturn(true);
            when(rateLimitService.allowInvitation(teamId)).thenReturn(true);
            when(invitationRepository.existsPendingInvitationByTeamIdAndEmail(teamId, "b@x.com"))
                    .thenReturn(false);
            when(userRepository.findByEmail("b@x.com")).thenReturn(Optional.of(invitee));
            when(billingSubscriptionRepository.existsActivePaidSubscriptionForUser(SUPABASE_ID))
                    .thenReturn(false);
            when(membershipRepository.existsByTeamIdAndUserId(teamId, 2L)).thenReturn(true);

            assertThatThrownBy(() -> service.inviteUserToTeam(teamId, "b@x.com", inviter))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("already a team member");
        }

        @Test
        @DisplayName("creates a PENDING invitation with token+expiry and sends the email (success)")
        void success_existingFreeInvitee() {
            Team t = team(teamId, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            User invitee = user(2L, "b@x.com", "bob");
            invitee.setSupabaseId(SUPABASE_ID);
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, inviter, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(saasTeamExtensionService.canInviteMembers(t)).thenReturn(true);
            when(rateLimitService.allowInvitation(teamId)).thenReturn(true);
            when(invitationRepository.existsPendingInvitationByTeamIdAndEmail(teamId, "b@x.com"))
                    .thenReturn(false);
            when(userRepository.findByEmail("b@x.com")).thenReturn(Optional.of(invitee));
            when(billingSubscriptionRepository.existsActivePaidSubscriptionForUser(SUPABASE_ID))
                    .thenReturn(false);
            when(membershipRepository.existsByTeamIdAndUserId(teamId, 2L)).thenReturn(false);
            when(invitationRepository.save(any(TeamInvitation.class)))
                    .thenAnswer(inv -> inv.getArgument(0));
            // Edge function unconfigured so sendInvitationEmail short-circuits without
            // RestTemplate.
            when(supabaseConfig.isEdgeFunctionConfigured()).thenReturn(false);

            TeamInvitation result = service.inviteUserToTeam(teamId, "b@x.com", inviter);

            assertThat(result.getStatus()).isEqualTo(InvitationStatus.PENDING);
            assertThat(result.getInvitationToken()).isNotBlank();
            assertThat(result.getExpiresAt()).isAfter(LocalDateTime.now().plusDays(6));
            assertThat(result.getInviteeUser()).isSameAs(invitee);
            verify(restTemplate, never()).postForEntity(any(String.class), any(), any());
        }

        @Test
        @DisplayName("succeeds for an unknown invitee (no existing user) leaving inviteeUser null")
        void success_unknownInvitee() {
            Team t = team(teamId, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, inviter, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(saasTeamExtensionService.canInviteMembers(t)).thenReturn(true);
            when(rateLimitService.allowInvitation(teamId)).thenReturn(true);
            when(invitationRepository.existsPendingInvitationByTeamIdAndEmail(teamId, "new@x.com"))
                    .thenReturn(false);
            when(userRepository.findByEmail("new@x.com")).thenReturn(Optional.empty());
            when(invitationRepository.save(any(TeamInvitation.class)))
                    .thenAnswer(inv -> inv.getArgument(0));
            when(supabaseConfig.isEdgeFunctionConfigured()).thenReturn(false);

            TeamInvitation result = service.inviteUserToTeam(teamId, "new@x.com", inviter);

            assertThat(result.getInviteeUser()).isNull();
            assertThat(result.getInviteeEmail()).isEqualTo("new@x.com");
        }

        @Test
        @DisplayName("sends the email via RestTemplate when the edge function is configured")
        void success_sendsEmailWhenConfigured() {
            Team t = team(teamId, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, inviter, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(saasTeamExtensionService.canInviteMembers(t)).thenReturn(true);
            when(rateLimitService.allowInvitation(teamId)).thenReturn(true);
            when(invitationRepository.existsPendingInvitationByTeamIdAndEmail(teamId, "new@x.com"))
                    .thenReturn(false);
            when(userRepository.findByEmail("new@x.com")).thenReturn(Optional.empty());
            when(invitationRepository.save(any(TeamInvitation.class)))
                    .thenAnswer(inv -> inv.getArgument(0));
            when(supabaseConfig.isEdgeFunctionConfigured()).thenReturn(true);
            when(supabaseConfig.getEdgeFunctionUrl()).thenReturn("https://edge.example");
            when(supabaseConfig.getEdgeFunctionSecret()).thenReturn("secret");

            service.inviteUserToTeam(teamId, "new@x.com", inviter);

            ArgumentCaptor<String> urlCap = ArgumentCaptor.forClass(String.class);
            verify(restTemplate).postForEntity(urlCap.capture(), any(), eq(String.class));
            assertThat(urlCap.getValue()).isEqualTo("https://edge.example/team-invitation-email");
        }

        @Test
        @DisplayName("swallows a RestTemplate failure so the saved invitation is still returned")
        void emailFailure_swallowedInvitationReturned() {
            Team t = team(teamId, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, inviter, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(saasTeamExtensionService.canInviteMembers(t)).thenReturn(true);
            when(rateLimitService.allowInvitation(teamId)).thenReturn(true);
            when(invitationRepository.existsPendingInvitationByTeamIdAndEmail(teamId, "new@x.com"))
                    .thenReturn(false);
            when(userRepository.findByEmail("new@x.com")).thenReturn(Optional.empty());
            when(invitationRepository.save(any(TeamInvitation.class)))
                    .thenAnswer(inv -> inv.getArgument(0));
            when(supabaseConfig.isEdgeFunctionConfigured()).thenReturn(true);
            when(supabaseConfig.getEdgeFunctionUrl()).thenReturn("https://edge.example");
            when(supabaseConfig.getEdgeFunctionSecret()).thenReturn("secret");
            when(restTemplate.postForEntity(any(String.class), any(), eq(String.class)))
                    .thenThrow(new RuntimeException("network down"));

            TeamInvitation result = service.inviteUserToTeam(teamId, "new@x.com", inviter);

            assertThat(result).isNotNull();
            assertThat(result.getStatus()).isEqualTo(InvitationStatus.PENDING);
        }

        @Test
        @DisplayName("treats a billing-lookup error as having a subscription (fail-safe block)")
        void inviteeBillingLookupError_failsSafeAndBlocks() {
            Team t = team(teamId, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            User invitee = user(2L, "b@x.com", "bob");
            invitee.setSupabaseId(SUPABASE_ID);
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, inviter, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(saasTeamExtensionService.canInviteMembers(t)).thenReturn(true);
            when(rateLimitService.allowInvitation(teamId)).thenReturn(true);
            when(invitationRepository.existsPendingInvitationByTeamIdAndEmail(teamId, "b@x.com"))
                    .thenReturn(false);
            when(userRepository.findByEmail("b@x.com")).thenReturn(Optional.of(invitee));
            when(billingSubscriptionRepository.existsActivePaidSubscriptionForUser(SUPABASE_ID))
                    .thenThrow(new RuntimeException("db down"));

            // hasPaidSubscription catches the error and returns true -> blocks as a paid user.
            assertThatThrownBy(() -> service.inviteUserToTeam(teamId, "b@x.com", inviter))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Cannot invite paid users");
        }
    }

    // =============================================================================================
    @Nested
    @DisplayName("acceptInvitation")
    class AcceptInvitation {

        private TeamInvitation pendingInvitation(Team team, User inviter, String email) {
            TeamInvitation inv = new TeamInvitation();
            inv.setTeam(team);
            inv.setInviter(inviter);
            inv.setInviteeEmail(email);
            inv.setStatus(InvitationStatus.PENDING);
            inv.setInvitationToken("tok-123");
            inv.setExpiresAt(LocalDateTime.now().plusDays(3));
            inv.setCreatedAt(LocalDateTime.now().minusDays(1));
            return inv;
        }

        @Test
        @DisplayName("throws when the accepting user no longer exists")
        void userNotFound_throws() {
            User u = user(5L, "b@x.com", "bob");
            when(userRepository.findById(5L)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.acceptInvitation("tok-123", u))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("User not found: 5");
        }

        @Test
        @DisplayName("throws when the invitation token is unknown")
        void invitationNotFound_throws() {
            User u = user(5L, "b@x.com", "bob");
            when(userRepository.findById(5L)).thenReturn(Optional.of(u));
            when(invitationRepository.findByInvitationToken("tok-123"))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.acceptInvitation("tok-123", u))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Invitation not found");
        }

        @Test
        @DisplayName("throws when the invitation is not PENDING")
        void notPending_throws() {
            User u = user(5L, "b@x.com", "bob");
            Team t = team(100L, "Acme");
            TeamInvitation inv = pendingInvitation(t, user(1L, "a@x.com", "alice"), "b@x.com");
            inv.setStatus(InvitationStatus.ACCEPTED);
            when(userRepository.findById(5L)).thenReturn(Optional.of(u));
            when(invitationRepository.findByInvitationToken("tok-123"))
                    .thenReturn(Optional.of(inv));

            assertThatThrownBy(() -> service.acceptInvitation("tok-123", u))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("already processed");
        }

        @Test
        @DisplayName("marks the invitation EXPIRED and throws when it has expired")
        void expired_marksExpiredAndThrows() {
            User u = user(5L, "b@x.com", "bob");
            Team t = team(100L, "Acme");
            TeamInvitation inv = pendingInvitation(t, user(1L, "a@x.com", "alice"), "b@x.com");
            inv.setExpiresAt(LocalDateTime.now().minusDays(1));
            when(userRepository.findById(5L)).thenReturn(Optional.of(u));
            when(invitationRepository.findByInvitationToken("tok-123"))
                    .thenReturn(Optional.of(inv));

            assertThatThrownBy(() -> service.acceptInvitation("tok-123", u))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("expired");
            assertThat(inv.getStatus()).isEqualTo(InvitationStatus.EXPIRED);
            verify(invitationRepository).save(inv);
        }

        @Test
        @DisplayName("throws SecurityException when the invitee email does not match the user")
        void emailMismatch_throws() {
            User u = user(5L, "other@x.com", "bob");
            Team t = team(100L, "Acme");
            TeamInvitation inv = pendingInvitation(t, user(1L, "a@x.com", "alice"), "b@x.com");
            when(userRepository.findById(5L)).thenReturn(Optional.of(u));
            when(invitationRepository.findByInvitationToken("tok-123"))
                    .thenReturn(Optional.of(inv));

            assertThatThrownBy(() -> service.acceptInvitation("tok-123", u))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("email mismatch");
        }

        @Test
        @DisplayName("throws when the accepting user has an active paid subscription")
        void acceptingUserPaid_throws() {
            User u = user(5L, "b@x.com", "bob");
            u.setSupabaseId(SUPABASE_ID);
            Team t = team(100L, "Acme");
            TeamInvitation inv = pendingInvitation(t, user(1L, "a@x.com", "alice"), "b@x.com");
            when(userRepository.findById(5L)).thenReturn(Optional.of(u));
            when(invitationRepository.findByInvitationToken("tok-123"))
                    .thenReturn(Optional.of(inv));
            when(billingSubscriptionRepository.existsActivePaidSubscriptionForUser(SUPABASE_ID))
                    .thenReturn(true);

            assertThatThrownBy(() -> service.acceptInvitation("tok-123", u))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Cancel your subscription");
        }

        @Test
        @DisplayName("throws when the inviting team has no available seats")
        void teamNoSeats_throws() {
            User u = user(5L, "b@x.com", "bob");
            Team t = team(100L, "Acme");
            TeamInvitation inv = pendingInvitation(t, user(1L, "a@x.com", "alice"), "b@x.com");
            when(userRepository.findById(5L)).thenReturn(Optional.of(u));
            when(invitationRepository.findByInvitationToken("tok-123"))
                    .thenReturn(Optional.of(inv));
            when(saasTeamExtensionService.hasAvailableSeats(t)).thenReturn(false);

            assertThatThrownBy(() -> service.acceptInvitation("tok-123", u))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("no available seats");
        }

        @Test
        @DisplayName("blocks accept when the user is the last leader of a paid non-personal team")
        void lastLeaderOfPaidTeam_blocksAccept() {
            User u = user(5L, "b@x.com", "bob");
            Team newTeam = team(100L, "Acme");
            Team ownTeam = team(200L, "Bob Co");
            TeamInvitation inv =
                    pendingInvitation(newTeam, user(1L, "a@x.com", "alice"), "b@x.com");
            when(userRepository.findById(5L)).thenReturn(Optional.of(u));
            when(invitationRepository.findByInvitationToken("tok-123"))
                    .thenReturn(Optional.of(inv));
            when(saasTeamExtensionService.hasAvailableSeats(newTeam)).thenReturn(true);
            when(membershipRepository.findByUserId(5L))
                    .thenReturn(List.of(membership(ownTeam, u, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(ownTeam)).thenReturn(false);
            when(membershipRepository.countByTeamIdAndRole(200L, TeamRole.LEADER)).thenReturn(1L);
            when(billingSubscriptionRepository.existsActiveSubscriptionForTeam(200L))
                    .thenReturn(true);

            assertThatThrownBy(() -> service.acceptInvitation("tok-123", u))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("active plan");
        }

        @Test
        @DisplayName(
                "blocks accept when the user is the last leader of an unpaid non-personal team")
        void lastLeaderOfUnpaidTeam_blocksAccept() {
            User u = user(5L, "b@x.com", "bob");
            Team newTeam = team(100L, "Acme");
            Team ownTeam = team(200L, "Bob Co");
            TeamInvitation inv =
                    pendingInvitation(newTeam, user(1L, "a@x.com", "alice"), "b@x.com");
            when(userRepository.findById(5L)).thenReturn(Optional.of(u));
            when(invitationRepository.findByInvitationToken("tok-123"))
                    .thenReturn(Optional.of(inv));
            when(saasTeamExtensionService.hasAvailableSeats(newTeam)).thenReturn(true);
            when(membershipRepository.findByUserId(5L))
                    .thenReturn(List.of(membership(ownTeam, u, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(ownTeam)).thenReturn(false);
            when(membershipRepository.countByTeamIdAndRole(200L, TeamRole.LEADER)).thenReturn(1L);
            when(billingSubscriptionRepository.existsActiveSubscriptionForTeam(200L))
                    .thenReturn(false);

            assertThatThrownBy(() -> service.acceptInvitation("tok-123", u))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("Transfer leadership");
        }

        @Test
        @DisplayName(
                "happy path: leaves personal team, deletes it, joins new team, increments seats")
        void success_migratesFromPersonalTeam() {
            User u = user(5L, "b@x.com", "bob");
            Team newTeam = team(100L, "Acme");
            Team personal = team(200L, "My Team");
            User inviter = user(1L, "a@x.com", "alice");
            TeamInvitation inv = pendingInvitation(newTeam, inviter, "b@x.com");
            TeamMembership personalMembership = membership(personal, u, TeamRole.LEADER);

            when(userRepository.findById(5L)).thenReturn(Optional.of(u));
            when(invitationRepository.findByInvitationToken("tok-123"))
                    .thenReturn(Optional.of(inv));
            when(saasTeamExtensionService.hasAvailableSeats(newTeam)).thenReturn(true);
            // assertCanLeave... iterates memberships; personal team is skipped.
            when(membershipRepository.findByUserId(5L))
                    .thenReturn(List.of(personalMembership))
                    .thenReturn(List.of(personalMembership));
            when(saasTeamExtensionService.isPersonal(personal)).thenReturn(true);
            when(membershipRepository.countByTeamId(200L)).thenReturn(0L);
            when(saasTeamExtensionsRepository.incrementSeatsUsed(100L)).thenReturn(1);

            service.acceptInvitation("tok-123", u);

            verify(membershipRepository).delete(personalMembership);
            verify(saasTeamExtensionsRepository).decrementSeatsUsed(200L);
            verify(teamRepository).delete(personal);
            verify(userRepository).updateUserTeamId(5L, 100L);
            assertThat(inv.getStatus()).isEqualTo(InvitationStatus.ACCEPTED);
            ArgumentCaptor<TeamMembership> mcap = ArgumentCaptor.forClass(TeamMembership.class);
            verify(membershipRepository).save(mcap.capture());
            assertThat(mcap.getValue().getRole()).isEqualTo(TeamRole.MEMBER);
            assertThat(mcap.getValue().getInvitedBy()).isSameAs(inviter);
        }

        @Test
        @DisplayName("throws if the atomic seat increment loses the race (rowsUpdated == 0)")
        void seatIncrementRace_throws() {
            User u = user(5L, "b@x.com", "bob");
            Team newTeam = team(100L, "Acme");
            User inviter = user(1L, "a@x.com", "alice");
            TeamInvitation inv = pendingInvitation(newTeam, inviter, "b@x.com");

            when(userRepository.findById(5L)).thenReturn(Optional.of(u));
            when(invitationRepository.findByInvitationToken("tok-123"))
                    .thenReturn(Optional.of(inv));
            when(saasTeamExtensionService.hasAvailableSeats(newTeam)).thenReturn(true);
            when(membershipRepository.findByUserId(5L)).thenReturn(new ArrayList<>());
            when(saasTeamExtensionsRepository.incrementSeatsUsed(100L)).thenReturn(0);

            assertThatThrownBy(() -> service.acceptInvitation("tok-123", u))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("no available seats");
        }

        @Test
        @DisplayName("does not delete a non-personal old team even when it ends up empty")
        void nonPersonalOldTeam_notDeleted() {
            User u = user(5L, "b@x.com", "bob");
            Team newTeam = team(100L, "Acme");
            Team oldTeam = team(300L, "Old Co");
            User inviter = user(1L, "a@x.com", "alice");
            TeamInvitation inv = pendingInvitation(newTeam, inviter, "b@x.com");
            // Member (not leader) leaving the old team: assertCanLeave skips, accept proceeds.
            TeamMembership oldMembership = membership(oldTeam, u, TeamRole.MEMBER);

            when(userRepository.findById(5L)).thenReturn(Optional.of(u));
            when(invitationRepository.findByInvitationToken("tok-123"))
                    .thenReturn(Optional.of(inv));
            when(saasTeamExtensionService.hasAvailableSeats(newTeam)).thenReturn(true);
            when(membershipRepository.findByUserId(5L))
                    .thenReturn(List.of(oldMembership))
                    .thenReturn(List.of(oldMembership));
            when(saasTeamExtensionService.isPersonal(oldTeam)).thenReturn(false);
            when(saasTeamExtensionsRepository.incrementSeatsUsed(100L)).thenReturn(1);

            service.acceptInvitation("tok-123", u);

            verify(teamRepository, never()).delete(oldTeam);
            verify(userRepository).updateUserTeamId(5L, 100L);
        }
    }

    // =============================================================================================
    @Nested
    @DisplayName("acceptInvitationAndGrantRole")
    class AcceptInvitationAndGrantRole {

        private TeamInvitation pendingInvitation(Team team, User inviter, String email) {
            TeamInvitation inv = new TeamInvitation();
            inv.setTeam(team);
            inv.setInviter(inviter);
            inv.setInviteeEmail(email);
            inv.setStatus(InvitationStatus.PENDING);
            inv.setInvitationToken("tok-123");
            inv.setExpiresAt(LocalDateTime.now().plusDays(3));
            inv.setCreatedAt(LocalDateTime.now().minusDays(1));
            return inv;
        }

        // Stubs a minimal successful acceptInvitation into the given team.
        private void stubSuccessfulAccept(User u, Team newTeam) {
            TeamInvitation inv =
                    pendingInvitation(newTeam, user(1L, "a@x.com", "alice"), "b@x.com");
            when(invitationRepository.findByInvitationToken("tok-123"))
                    .thenReturn(Optional.of(inv));
            when(saasTeamExtensionService.hasAvailableSeats(newTeam)).thenReturn(true);
            when(membershipRepository.findByUserId(u.getId())).thenReturn(new ArrayList<>());
            when(saasTeamExtensionsRepository.incrementSeatsUsed(newTeam.getId())).thenReturn(1);
        }

        @Test
        @DisplayName("grants ROLE_PRO_USER when the joined team has an active subscription")
        void grantsProWhenTeamPaid() throws Exception {
            User u = user(5L, "b@x.com", "bob");
            Team newTeam = team(100L, "Acme");
            stubSuccessfulAccept(u, newTeam);
            // findById is used by acceptInvitation, then again to re-read post-accept.
            User reread = user(5L, "b@x.com", "bob");
            reread.setTeam(newTeam);
            when(userRepository.findById(5L))
                    .thenReturn(Optional.of(u))
                    .thenReturn(Optional.of(reread));
            when(billingSubscriptionRepository.existsActiveSubscriptionForTeam(100L))
                    .thenReturn(true);

            service.acceptInvitationAndGrantRole("tok-123", u);

            verify(userService).changeRole(reread, Role.PRO_USER.getRoleId());
        }

        @Test
        @DisplayName("does not grant PRO when the joined team has no active subscription")
        void noGrantWhenTeamUnpaid() throws Exception {
            User u = user(5L, "b@x.com", "bob");
            Team newTeam = team(100L, "Acme");
            stubSuccessfulAccept(u, newTeam);
            User reread = user(5L, "b@x.com", "bob");
            reread.setTeam(newTeam);
            when(userRepository.findById(5L))
                    .thenReturn(Optional.of(u))
                    .thenReturn(Optional.of(reread));
            when(billingSubscriptionRepository.existsActiveSubscriptionForTeam(100L))
                    .thenReturn(false);

            service.acceptInvitationAndGrantRole("tok-123", u);

            verify(userService, never()).changeRole(any(), any());
        }

        @Test
        @DisplayName("does not re-grant PRO when the user is already a PRO user")
        void noGrantWhenAlreadyPro() throws Exception {
            User u = user(5L, "b@x.com", "bob");
            Team newTeam = team(100L, "Acme");
            stubSuccessfulAccept(u, newTeam);
            User reread = proUser(5L, "b@x.com", "bob");
            reread.setTeam(newTeam);
            when(userRepository.findById(5L))
                    .thenReturn(Optional.of(u))
                    .thenReturn(Optional.of(reread));
            when(billingSubscriptionRepository.existsActiveSubscriptionForTeam(100L))
                    .thenReturn(true);

            service.acceptInvitationAndGrantRole("tok-123", u);

            verify(userService, never()).changeRole(any(), any());
        }

        @Test
        @DisplayName("does not grant PRO when the user ends up with a null team")
        void noGrantWhenTeamNull() throws Exception {
            User u = user(5L, "b@x.com", "bob");
            Team newTeam = team(100L, "Acme");
            stubSuccessfulAccept(u, newTeam);
            // Re-read returns a user whose team is null -> early return path.
            User reread = user(5L, "b@x.com", "bob");
            when(userRepository.findById(5L))
                    .thenReturn(Optional.of(u))
                    .thenReturn(Optional.of(reread));

            service.acceptInvitationAndGrantRole("tok-123", u);

            verify(userService, never()).changeRole(any(), any());
        }
    }

    // =============================================================================================
    @Nested
    @DisplayName("removeTeamMember")
    class RemoveTeamMember {

        private final Long teamId = 100L;

        @Test
        @DisplayName("throws SecurityException when the remover is not a member")
        void removerNotMember_throws() {
            User remover = user(1L, "a@x.com", "alice");
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.removeTeamMember(teamId, 2L, remover))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("not a member");
        }

        @Test
        @DisplayName("throws SecurityException when the remover is not a leader")
        void removerNotLeader_throws() {
            User remover = user(1L, "a@x.com", "alice");
            Team t = team(teamId, "Acme");
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(membership(t, remover, TeamRole.MEMBER)));

            assertThatThrownBy(() -> service.removeTeamMember(teamId, 2L, remover))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("Only team leaders");
        }

        @Test
        @DisplayName("throws when a sole leader tries to remove themselves")
        void soleLeaderRemovesSelf_throws() {
            User remover = user(1L, "a@x.com", "alice");
            Team t = team(teamId, "Acme");
            TeamMembership leaderM = membership(t, remover, TeamRole.LEADER);
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(leaderM));
            when(membershipRepository.findByTeamIdAndRole(teamId, TeamRole.LEADER))
                    .thenReturn(List.of(leaderM));

            assertThatThrownBy(() -> service.removeTeamMember(teamId, 1L, remover))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("last team leader");
        }

        @Test
        @DisplayName("throws when the member to remove is not in the team")
        void memberNotInTeam_throws() {
            User remover = user(1L, "a@x.com", "alice");
            Team t = team(teamId, "Acme");
            TeamMembership leaderM = membership(t, remover, TeamRole.LEADER);
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(leaderM));
            when(membershipRepository.findByTeamIdAndRole(teamId, TeamRole.LEADER))
                    .thenReturn(
                            List.of(
                                    leaderM,
                                    membership(t, user(9L, "c@x.com", "co"), TeamRole.LEADER)));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 2L))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.removeTeamMember(teamId, 2L, remover))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("User not found in team");
        }

        @Test
        @DisplayName("removes the member, decrements seats, makes a personal team, downgrades")
        void success_removesMemberAndDeletesEmptyTeam() {
            User remover = user(1L, "a@x.com", "alice");
            User target = user(2L, "b@x.com", "bob");
            Team t = team(teamId, "Acme");
            TeamMembership leaderM = membership(t, remover, TeamRole.LEADER);
            TeamMembership targetM = membership(t, target, TeamRole.MEMBER);

            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(leaderM));
            when(membershipRepository.findByTeamIdAndRole(teamId, TeamRole.LEADER))
                    .thenReturn(List.of(leaderM));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 2L))
                    .thenReturn(Optional.of(targetM));
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            // createPersonalTeam + downgradeUserToFree both refetch the removed user by id.
            // target has no PRO authority, so downgrade hits the early return.
            stubCreatePersonalTeam(target, 500L);
            // team becomes empty + non-personal -> deleted
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(membershipRepository.countByTeamId(teamId)).thenReturn(0L);

            service.removeTeamMember(teamId, 2L, remover);

            verify(membershipRepository).delete(targetM);
            verify(saasTeamExtensionsRepository).decrementSeatsUsed(teamId);
            verify(teamRepository).delete(t);
        }

        @Test
        @DisplayName("keeps a non-empty team after removing a member")
        void success_keepsNonEmptyTeam() {
            User remover = user(1L, "a@x.com", "alice");
            User target = user(2L, "b@x.com", "bob");
            Team t = team(teamId, "Acme");
            TeamMembership leaderM = membership(t, remover, TeamRole.LEADER);
            TeamMembership targetM = membership(t, target, TeamRole.MEMBER);

            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(leaderM));
            when(membershipRepository.findByTeamIdAndRole(teamId, TeamRole.LEADER))
                    .thenReturn(List.of(leaderM));
            when(membershipRepository.findByTeamIdAndUserId(teamId, 2L))
                    .thenReturn(Optional.of(targetM));
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            stubCreatePersonalTeam(target, 500L);
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(membershipRepository.countByTeamId(teamId)).thenReturn(2L);

            service.removeTeamMember(teamId, 2L, remover);

            verify(teamRepository, never()).delete(t);
        }
    }

    // =============================================================================================
    @Nested
    @DisplayName("leaveTeam")
    class LeaveTeam {

        private final Long teamId = 100L;

        @Test
        @DisplayName("throws when the user is not a member of the team")
        void notMember_throws() {
            User u = user(1L, "a@x.com", "alice");
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.leaveTeam(teamId, u))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Not a member of this team");
        }

        @Test
        @DisplayName("throws when the sole leader tries to leave")
        void soleLeaderLeaves_throws() {
            User u = user(1L, "a@x.com", "alice");
            Team t = team(teamId, "Acme");
            TeamMembership leaderM = membership(t, u, TeamRole.LEADER);
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(leaderM));
            when(membershipRepository.findByTeamIdAndRole(teamId, TeamRole.LEADER))
                    .thenReturn(List.of(leaderM));

            assertThatThrownBy(() -> service.leaveTeam(teamId, u))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("last team leader");
        }

        @Test
        @DisplayName("member leaves: deletes membership, decrements, makes personal team")
        void memberLeaves_success() {
            User u = user(1L, "a@x.com", "alice");
            Team t = team(teamId, "Acme");
            TeamMembership memberM = membership(t, u, TeamRole.MEMBER);
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(memberM));
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            stubCreatePersonalTeam(u, 500L);
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(true);

            service.leaveTeam(teamId, u);

            verify(membershipRepository).delete(memberM);
            verify(saasTeamExtensionsRepository).decrementSeatsUsed(teamId);
            // Personal team is never deleted on leave.
            verify(teamRepository, never()).delete(any());
        }

        @Test
        @DisplayName("leader leaves when another leader remains: deletes empty non-personal team")
        void leaderLeavesWithCoLeader_deletesEmptyTeam() {
            User u = user(1L, "a@x.com", "alice");
            Team t = team(teamId, "Acme");
            TeamMembership leaderM = membership(t, u, TeamRole.LEADER);
            TeamMembership coLeaderM = membership(t, user(9L, "c@x.com", "co"), TeamRole.LEADER);
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(leaderM));
            when(membershipRepository.findByTeamIdAndRole(teamId, TeamRole.LEADER))
                    .thenReturn(List.of(leaderM, coLeaderM));
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            stubCreatePersonalTeam(u, 500L);
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);
            when(membershipRepository.countByTeamId(teamId)).thenReturn(0L);

            service.leaveTeam(teamId, u);

            verify(teamRepository).delete(t);
        }

        @Test
        @DisplayName("keeps PRO access on leave when the user still has an active subscription")
        void leaveKeepsProWhenSubscribed() {
            User u = user(1L, "a@x.com", "alice");
            Team t = team(teamId, "Acme");
            TeamMembership memberM = membership(t, u, TeamRole.MEMBER);
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(memberM));
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            stubTeamSave(500L);
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(true);
            // Both createPersonalTeam and downgradeUserToFree refetch by id; return the PRO user
            // with an active sub -> keep PRO.
            User proRefetch = proUser(1L, "a@x.com", "alice");
            proRefetch.setSupabaseId(SUPABASE_ID);
            when(userRepository.findById(1L)).thenReturn(Optional.of(proRefetch));
            when(billingSubscriptionRepository.existsActiveSubscriptionForUser(SUPABASE_ID))
                    .thenReturn(true);

            service.leaveTeam(teamId, u);

            verify(userRoleService, never()).downgradeToFree(any());
        }

        @Test
        @DisplayName("downgrades a PRO user with no subscription to FREE on leave")
        void leaveDowngradesProWithoutSubscription() {
            User u = user(1L, "a@x.com", "alice");
            Team t = team(teamId, "Acme");
            TeamMembership memberM = membership(t, u, TeamRole.MEMBER);
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(memberM));
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            stubTeamSave(500L);
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(true);
            User proRefetch = proUser(1L, "a@x.com", "alice");
            proRefetch.setSupabaseId(SUPABASE_ID);
            when(userRepository.findById(1L)).thenReturn(Optional.of(proRefetch));
            when(billingSubscriptionRepository.existsActiveSubscriptionForUser(SUPABASE_ID))
                    .thenReturn(false);

            service.leaveTeam(teamId, u);

            verify(userRoleService).downgradeToFree(proRefetch);
        }

        @Test
        @DisplayName("downgrades a PRO user with no supabaseId to FREE on leave")
        void leaveDowngradesProWithoutSupabaseId() {
            User u = user(1L, "a@x.com", "alice");
            Team t = team(teamId, "Acme");
            TeamMembership memberM = membership(t, u, TeamRole.MEMBER);
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(memberM));
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            stubTeamSave(500L);
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(true);
            // PRO user without supabaseId skips the subscription check and downgrades.
            User proRefetch = proUser(1L, "a@x.com", "alice");
            when(userRepository.findById(1L)).thenReturn(Optional.of(proRefetch));

            service.leaveTeam(teamId, u);

            verify(userRoleService).downgradeToFree(proRefetch);
        }

        @Test
        @DisplayName("downgrades to FREE when the subscription lookup throws (fail-safe)")
        void leaveDowngradesWhenSubscriptionLookupErrors() {
            User u = user(1L, "a@x.com", "alice");
            Team t = team(teamId, "Acme");
            TeamMembership memberM = membership(t, u, TeamRole.MEMBER);
            when(membershipRepository.findByTeamIdAndUserId(teamId, 1L))
                    .thenReturn(Optional.of(memberM));
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            stubTeamSave(500L);
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(true);
            User proRefetch = proUser(1L, "a@x.com", "alice");
            proRefetch.setSupabaseId(SUPABASE_ID);
            when(userRepository.findById(1L)).thenReturn(Optional.of(proRefetch));
            when(billingSubscriptionRepository.existsActiveSubscriptionForUser(SUPABASE_ID))
                    .thenThrow(new RuntimeException("db down"));

            service.leaveTeam(teamId, u);

            // On error we proceed with the downgrade to be safe.
            verify(userRoleService).downgradeToFree(proRefetch);
        }
    }

    // =============================================================================================
    @Nested
    @DisplayName("hasActivePaidSubscription (team)")
    class HasActivePaidSubscription {

        @Test
        @DisplayName("returns false for a null team")
        void nullTeam_false() {
            assertThat(service.hasActivePaidSubscription(null)).isFalse();
        }

        @Test
        @DisplayName("returns false for a team without an id")
        void teamWithoutId_false() {
            assertThat(service.hasActivePaidSubscription(new Team())).isFalse();
        }

        @Test
        @DisplayName("returns true when the billing repo reports an active subscription")
        void activeSubscription_true() {
            Team t = team(100L, "Acme");
            when(billingSubscriptionRepository.existsActiveSubscriptionForTeam(100L))
                    .thenReturn(true);

            assertThat(service.hasActivePaidSubscription(t)).isTrue();
        }

        @Test
        @DisplayName("returns false when the billing repo reports no subscription")
        void noSubscription_false() {
            Team t = team(100L, "Acme");
            when(billingSubscriptionRepository.existsActiveSubscriptionForTeam(100L))
                    .thenReturn(false);

            assertThat(service.hasActivePaidSubscription(t)).isFalse();
        }

        @Test
        @DisplayName("returns false (fail-safe) when the billing lookup throws")
        void lookupError_false() {
            Team t = team(100L, "Acme");
            when(billingSubscriptionRepository.existsActiveSubscriptionForTeam(100L))
                    .thenThrow(new RuntimeException("db down"));

            assertThat(service.hasActivePaidSubscription(t)).isFalse();
        }
    }

    // =============================================================================================
    @Nested
    @DisplayName("updateTeamSeats")
    class UpdateTeamSeats {

        private final Long teamId = 100L;

        @Test
        @DisplayName("throws when maxSeats is null")
        void nullMaxSeats_throws() {
            assertThatThrownBy(() -> service.updateTeamSeats(teamId, null))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("at least 1");
        }

        @Test
        @DisplayName("throws when maxSeats is below 1")
        void zeroMaxSeats_throws() {
            assertThatThrownBy(() -> service.updateTeamSeats(teamId, 0))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("at least 1");
        }

        @Test
        @DisplayName("throws when the team does not exist")
        void teamNotFound_throws() {
            when(teamRepository.findById(teamId)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.updateTeamSeats(teamId, 5))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Team not found");
        }

        @Test
        @DisplayName("increasing seats on a personal team converts it to standard")
        void increaseSeats_personalBecomesStandard() {
            Team t = team(teamId, "My Team");
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(saasTeamExtensionService.getSeatsUsed(t)).thenReturn(1);
            when(saasTeamExtensionService.getMaxSeats(t)).thenReturn(1);
            // First isPersonal call (after setSeats) returns true -> convert to standard.
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(true, false);

            service.updateTeamSeats(teamId, 5);

            verify(saasTeamExtensionService).setSeats(t, 5, 5);
            verify(saasTeamExtensionService).setPersonal(t, false);
            verify(teamRepository).save(t);
        }

        @Test
        @DisplayName("reducing to 1 seat on a standard team converts it back to personal")
        void reduceToOne_standardBecomesPersonal() {
            Team t = team(teamId, "Acme");
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(saasTeamExtensionService.getSeatsUsed(t)).thenReturn(1);
            when(saasTeamExtensionService.getMaxSeats(t)).thenReturn(5);
            // Was standard (false) so reducing to 1 flips back to personal.
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);

            service.updateTeamSeats(teamId, 1);

            verify(saasTeamExtensionService).setPersonal(t, true);
        }

        @Test
        @DisplayName("removes excess members (members before leaders) when reducing below usage")
        void reduceBelowUsage_removesExcessMembers() {
            Team t = team(teamId, "Acme");
            User leader = user(1L, "a@x.com", "alice");
            User member = user(2L, "b@x.com", "bob");
            // Distinct membership ids so delete() verification can tell the two rows apart
            // (TeamMembership equals is by membershipId).
            TeamMembership leaderM = membership(t, leader, TeamRole.LEADER);
            leaderM.setMembershipId(1L);
            TeamMembership memberM = membership(t, member, TeamRole.MEMBER);
            memberM.setMembershipId(2L);
            memberM.setAcceptedAt(LocalDateTime.now());
            leaderM.setAcceptedAt(LocalDateTime.now().minusDays(10));

            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(saasTeamExtensionService.getSeatsUsed(t)).thenReturn(2);
            when(saasTeamExtensionService.getMaxSeats(t)).thenReturn(2);
            when(membershipRepository.findByTeamId(teamId)).thenReturn(List.of(leaderM, memberM));
            // Reduce to 1: must remove 1 excess; the MEMBER goes first.
            stubCreatePersonalTeam(member, 500L);
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);

            service.updateTeamSeats(teamId, 1);

            // The MEMBER is removed, the LEADER kept (removal prioritises non-leaders).
            verify(membershipRepository).delete(memberM);
            verify(membershipRepository, never()).delete(leaderM);
            // One decrement for the removed member, then a second seat update is applied via
            // setSeats(t, 1, 1). Reducing to 1 seat also flips a standard team back to personal:
            // setPersonal(true) is invoked for both the removed member's new personal team and t.
            verify(saasTeamExtensionsRepository).decrementSeatsUsed(teamId);
            verify(saasTeamExtensionService, org.mockito.Mockito.times(2))
                    .setPersonal(any(), eq(true));
        }

        @Test
        @DisplayName("plain seat update on a standard team with no conversion needed")
        void plainUpdate_noConversion() {
            Team t = team(teamId, "Acme");
            when(teamRepository.findById(teamId)).thenReturn(Optional.of(t));
            when(saasTeamExtensionService.getSeatsUsed(t)).thenReturn(2);
            when(saasTeamExtensionService.getMaxSeats(t)).thenReturn(5);
            // Already standard, raising to 10: neither conversion branch fires.
            when(saasTeamExtensionService.isPersonal(t)).thenReturn(false);

            service.updateTeamSeats(teamId, 10);

            verify(saasTeamExtensionService).setSeats(t, 10, 10);
            verify(saasTeamExtensionService, never()).setPersonal(any(), eq(true));
            verify(saasTeamExtensionService, never()).setPersonal(any(), eq(false));
            verify(teamRepository).save(t);
        }
    }

    // ---- shared helpers -------------------------------------------------------------------------

    // Stubs the collaborators createPersonalTeam touches so callers (ensure/remove/leave/update)
    // can drive it without exploding. Returns a saved team with the given id.
    private void stubCreatePersonalTeam(User u, long newTeamId) {
        when(userRepository.findById(u.getId())).thenReturn(Optional.of(u));
        stubTeamSave(newTeamId);
    }

    // Stubs only teamRepository.save (assigns an id), for callers that stub findById themselves.
    private void stubTeamSave(long newTeamId) {
        when(teamRepository.save(any(Team.class)))
                .thenAnswer(
                        inv -> {
                            Team saved = inv.getArgument(0);
                            saved.setId(newTeamId);
                            return saved;
                        });
    }

    /**
     * acceptInvitation's orphan guard against linked self-hosted instances (combined-billing "Mode
     * A"). The guard ({@code assertCanLeaveCurrentTeamsToJoinAnother}) is private; it's exercised
     * through its only caller up to the point where a team with active linked instances must block
     * the move. LENIENT because the pass-through case stubs the full leave/join path while the
     * blocking case short-circuits before reaching all of it.
     */
    @Nested
    @DisplayName("acceptInvitation - linked self-hosted instance orphan guard")
    @MockitoSettings(strictness = Strictness.LENIENT)
    class AcceptInvitationLinkedInstanceGuard {

        private static final long USER_ID = 7L;
        private static final long OLD_TEAM_ID = 100L;
        private static final long NEW_TEAM_ID = 200L;
        private static final String TOKEN = "tok-1";
        private static final String EMAIL = "joiner@example.com";

        @Test
        @DisplayName("blocks accept when the current team has active linked instances")
        void blocksWhenCurrentTeamHasActiveLinkedInstances() {
            User joiner = user(USER_ID, EMAIL, EMAIL);
            Team oldTeam = team(OLD_TEAM_ID, "old-team");
            Team newTeam = team(NEW_TEAM_ID, "new-team");
            TeamInvitation invitation = pendingInvitation(newTeam, joiner);

            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(joiner));
            when(invitationRepository.findByInvitationToken(TOKEN))
                    .thenReturn(Optional.of(invitation));
            when(saasTeamExtensionService.hasAvailableSeats(newTeam)).thenReturn(true);
            when(membershipRepository.findByUserId(USER_ID))
                    .thenReturn(List.of(membership(oldTeam, joiner, TeamRole.LEADER)));
            when(linkedInstanceRepository.countByTeamIdAndRevokedAtIsNull(OLD_TEAM_ID))
                    .thenReturn(1L);

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
        @DisplayName("lets accept through when the current team has no linked instances")
        void passesGuardWhenNoLinkedInstances() {
            User joiner = user(USER_ID, EMAIL, EMAIL);
            Team oldTeam = team(OLD_TEAM_ID, "old-team");
            Team newTeam = team(NEW_TEAM_ID, "new-team");
            TeamInvitation invitation = pendingInvitation(newTeam, joiner);
            TeamMembership oldMembership = membership(oldTeam, joiner, TeamRole.LEADER);

            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(joiner));
            when(invitationRepository.findByInvitationToken(TOKEN))
                    .thenReturn(Optional.of(invitation));
            when(saasTeamExtensionService.hasAvailableSeats(newTeam)).thenReturn(true);
            when(membershipRepository.findByUserId(USER_ID)).thenReturn(List.of(oldMembership));
            when(linkedInstanceRepository.countByTeamIdAndRevokedAtIsNull(OLD_TEAM_ID))
                    .thenReturn(0L);
            // Personal old team → guard skips the last-leader check and leave/join proceeds.
            when(saasTeamExtensionService.isPersonal(oldTeam)).thenReturn(true);
            when(membershipRepository.countByTeamId(OLD_TEAM_ID)).thenReturn(0L);
            when(saasTeamExtensionsRepository.incrementSeatsUsed(NEW_TEAM_ID)).thenReturn(1);

            service.acceptInvitation(TOKEN, joiner);

            // Guard let the move through: the old membership was left and the user re-pointed.
            verify(membershipRepository).delete(oldMembership);
            verify(userRepository).updateUserTeamId(USER_ID, NEW_TEAM_ID);
            verify(invitationRepository).save(invitation);
            assertThat(invitation.getStatus()).isEqualTo(InvitationStatus.ACCEPTED);
        }

        private TeamInvitation pendingInvitation(Team team, User invitee) {
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
}
