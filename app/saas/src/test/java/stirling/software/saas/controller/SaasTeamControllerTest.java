package stirling.software.saas.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

import stirling.software.common.model.enumeration.InvitationStatus;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.controller.SaasTeamController.InviteUserRequest;
import stirling.software.saas.controller.SaasTeamController.RenameTeamRequest;
import stirling.software.saas.controller.SaasTeamController.UpdateSeatsRequest;
import stirling.software.saas.model.TeamInvitation;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.repository.TeamInvitationRepository;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.security.TeamSecurityExpressions;
import stirling.software.saas.service.SaasTeamExtensionService;
import stirling.software.saas.service.SaasTeamService;

/**
 * Pure-Mockito unit tests for {@link SaasTeamController}.
 *
 * <p>Each handler is invoked directly with mocked collaborators and the returned {@link
 * ResponseEntity} (status + body) is asserted, alongside repository/service interaction
 * verification. The controller uses {@code @RequiredArgsConstructor}, so {@link InjectMocks} wires
 * the mocks by type into the field-injection constructor.
 *
 * <p>The {@code getCurrentUser()} helper resolves the principal via {@code
 * userService.getCurrentUsername()} then {@code userService.findByUsername(...)}; tests that reach
 * a handler body stub that pair. Several handlers are {@code @Transactional} and call {@link
 * TransactionAspectSupport#currentTransactionStatus()} on their error paths, which requires a
 * thread-bound transaction info; {@code TransactionSupport} installs a no-op one and clears it.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SaasTeamControllerTest {

    @Mock private TeamRepository teamRepository;
    @Mock private UserRepository userRepository;
    @Mock private TeamService teamService;
    @Mock private SaasTeamService saasTeamService;
    @Mock private SaasTeamExtensionService saasTeamExtensionService;
    @Mock private TeamMembershipRepository membershipRepository;
    @Mock private TeamInvitationRepository invitationRepository;
    @Mock private UserService userService;
    @Mock private TeamSecurityExpressions teamSecurityExpressions;

    @InjectMocks private SaasTeamController controller;

    private static final String CURRENT_USERNAME = "alice";
    private static final String CURRENT_EMAIL = "alice@example.com";

    private User currentUser;

    @BeforeEach
    void setUp() {
        currentUser = user(7L, CURRENT_USERNAME, CURRENT_EMAIL);
    }

    // ===== helpers =====

    private static User user(Long id, String username, String email) {
        User u = new User();
        u.setId(id);
        u.setUsername(username);
        u.setEmail(email);
        return u;
    }

    private static Team team(Long id, String name) {
        Team t = new Team();
        t.setId(id);
        t.setName(name);
        return t;
    }

    private TeamInvitation invitation(
            Long id, Team team, User inviter, String inviteeEmail, InvitationStatus status) {
        TeamInvitation inv = new TeamInvitation();
        inv.setInvitationId(id);
        inv.setTeam(team);
        inv.setInviter(inviter);
        inv.setInviteeEmail(inviteeEmail);
        inv.setStatus(status);
        inv.setInvitationToken("tok-" + id);
        inv.setExpiresAt(LocalDateTime.now().plusDays(3));
        return inv;
    }

    private TeamMembership membership(Team team, User member, TeamRole role) {
        TeamMembership m = new TeamMembership();
        m.setTeam(team);
        m.setUser(member);
        m.setRole(role);
        m.setAcceptedAt(LocalDateTime.now());
        return m;
    }

    /** Make {@code getCurrentUser()} resolve to {@link #currentUser}. */
    private void stubCurrentUser() {
        when(userService.getCurrentUsername()).thenReturn(CURRENT_USERNAME);
        when(userService.findByUsername(CURRENT_USERNAME)).thenReturn(Optional.of(currentUser));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> body(ResponseEntity<?> response) {
        return (Map<String, Object>) response.getBody();
    }

    @Nested
    @DisplayName("inviteUser")
    class InviteUser {

        private InviteUserRequest request(Long teamId, String email) {
            InviteUserRequest r = new InviteUserRequest();
            r.setTeamId(teamId);
            r.setEmail(email);
            return r;
        }

        @Test
        @DisplayName("happy path returns 200 with the invitation DTO")
        void happyPath() {
            stubCurrentUser();
            when(teamSecurityExpressions.isTeamLeader(10L)).thenReturn(true);
            Team team = team(10L, "Acme");
            TeamInvitation inv =
                    invitation(99L, team, currentUser, "bob@example.com", InvitationStatus.PENDING);
            when(saasTeamService.inviteUserToTeam(10L, "bob@example.com", currentUser))
                    .thenReturn(inv);

            ResponseEntity<?> response = controller.inviteUser(request(10L, "bob@example.com"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            SaasTeamController.InvitationDTO dto =
                    (SaasTeamController.InvitationDTO) response.getBody();
            assertThat(dto.getInvitationId()).isEqualTo(99L);
            assertThat(dto.getTeamName()).isEqualTo("Acme");
            assertThat(dto.getInviteeEmail()).isEqualTo("bob@example.com");
            assertThat(dto.getInviterEmail()).isEqualTo(CURRENT_EMAIL);
            assertThat(dto.getStatus()).isEqualTo("PENDING");
        }

        @Test
        @DisplayName("non-leader is rejected with 403 before any service call")
        void nonLeaderForbidden() {
            stubCurrentUser();
            when(teamSecurityExpressions.isTeamLeader(10L)).thenReturn(false);

            ResponseEntity<?> response = controller.inviteUser(request(10L, "bob@example.com"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(body(response))
                    .containsEntry("error", "Only team leaders can invite members");
            verify(saasTeamService, never()).inviteUserToTeam(anyLong(), anyString(), any());
        }

        @Test
        @DisplayName("IllegalArgumentException from service maps to 400 with its message")
        void serviceIllegalArgument_isBadRequest() {
            stubCurrentUser();
            when(teamSecurityExpressions.isTeamLeader(10L)).thenReturn(true);
            when(saasTeamService.inviteUserToTeam(eq(10L), eq("bob@example.com"), any()))
                    .thenThrow(new IllegalArgumentException("User is already a team member"));

            ResponseEntity<?> response = controller.inviteUser(request(10L, "bob@example.com"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("error", "User is already a team member");
        }

        @Test
        @DisplayName("SecurityException from service maps to 400 with its message")
        void serviceSecurityException_isBadRequest() {
            stubCurrentUser();
            when(teamSecurityExpressions.isTeamLeader(10L)).thenReturn(true);
            when(saasTeamService.inviteUserToTeam(eq(10L), eq("bob@example.com"), any()))
                    .thenThrow(new SecurityException("Only team leaders can invite members"));

            ResponseEntity<?> response = controller.inviteUser(request(10L, "bob@example.com"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response))
                    .containsEntry("error", "Only team leaders can invite members");
        }

        @Test
        @DisplayName("unexpected RuntimeException maps to 500 with a generic message")
        void unexpectedError_isServerError() {
            stubCurrentUser();
            when(teamSecurityExpressions.isTeamLeader(10L)).thenReturn(true);
            when(saasTeamService.inviteUserToTeam(eq(10L), eq("bob@example.com"), any()))
                    .thenThrow(new RuntimeException("db down"));

            ResponseEntity<?> response = controller.inviteUser(request(10L, "bob@example.com"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(body(response)).containsEntry("error", "Failed to send invitation");
        }

        @Test
        @DisplayName("getCurrentUser failure (user not found) is caught as 400 SecurityException")
        void currentUserNotFound_isBadRequest() {
            when(userService.getCurrentUsername()).thenReturn(CURRENT_USERNAME);
            when(userService.findByUsername(CURRENT_USERNAME)).thenReturn(Optional.empty());

            ResponseEntity<?> response = controller.inviteUser(request(10L, "bob@example.com"));

            // getCurrentUser throws SecurityException, caught by the (SecurityException|IAE)
            // branch.
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response))
                    .containsEntry("error", "User not found: " + CURRENT_USERNAME);
            verify(teamSecurityExpressions, never()).isTeamLeader(anyLong());
        }
    }

    @Nested
    @DisplayName("acceptInvitation")
    class AcceptInvitation {

        @Test
        @DisplayName("happy path returns 200 success message")
        void happyPath() throws Exception {
            stubCurrentUser();

            ResponseEntity<?> response = controller.acceptInvitation("tok-1");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("message", "Invitation accepted");
            assertThat(body(response)).containsEntry("success", true);
            verify(saasTeamService).acceptInvitationAndGrantRole("tok-1", currentUser);
        }

        @Test
        @DisplayName("IllegalStateException (expired/already-accepted) maps to 400 and rolls back")
        void callerFixableFailure_isBadRequest() throws Exception {
            stubCurrentUser();
            TransactionSupport tx = TransactionSupport.bind();
            try {
                doThrow(new IllegalStateException("Invitation expired"))
                        .when(saasTeamService)
                        .acceptInvitationAndGrantRole("tok-1", currentUser);

                ResponseEntity<?> response = controller.acceptInvitation("tok-1");

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(body(response)).containsEntry("error", "Invitation expired");
                verify(tx.status()).setRollbackOnly();
            } finally {
                tx.unbind();
            }
        }

        @Test
        @DisplayName("unexpected error maps to 500 and rolls back")
        void unexpectedError_isServerError() throws Exception {
            stubCurrentUser();
            TransactionSupport tx = TransactionSupport.bind();
            try {
                doThrow(new RuntimeException("boom"))
                        .when(saasTeamService)
                        .acceptInvitationAndGrantRole("tok-1", currentUser);

                ResponseEntity<?> response = controller.acceptInvitation("tok-1");

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                assertThat(body(response)).containsEntry("error", "Failed to accept invitation");
                verify(tx.status()).setRollbackOnly();
            } finally {
                tx.unbind();
            }
        }
    }

    @Nested
    @DisplayName("rejectInvitation")
    class RejectInvitation {

        @Test
        @DisplayName(
                "happy path: pending invitation for the current user is set REJECTED and saved")
        void happyPath() {
            stubCurrentUser();
            Team team = team(10L, "Acme");
            TeamInvitation inv =
                    invitation(
                            5L,
                            team,
                            user(2L, "leader", "lead@x.com"),
                            CURRENT_EMAIL,
                            InvitationStatus.PENDING);
            when(invitationRepository.findByInvitationToken("tok-5")).thenReturn(Optional.of(inv));

            ResponseEntity<?> response = controller.rejectInvitation("tok-5");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("message", "Invitation rejected");
            assertThat(inv.getStatus()).isEqualTo(InvitationStatus.REJECTED);
            verify(invitationRepository).save(inv);
        }

        @Test
        @DisplayName("invitation matched by username (not email) is also accepted")
        void matchedByUsername() {
            stubCurrentUser();
            TeamInvitation inv =
                    invitation(
                            6L,
                            team(10L, "Acme"),
                            user(2L, "leader", "lead@x.com"),
                            CURRENT_USERNAME,
                            InvitationStatus.PENDING);
            when(invitationRepository.findByInvitationToken("tok-6")).thenReturn(Optional.of(inv));

            ResponseEntity<?> response = controller.rejectInvitation("tok-6");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(inv.getStatus()).isEqualTo(InvitationStatus.REJECTED);
        }

        @Test
        @DisplayName("missing invitation maps to 404")
        void notFound() {
            stubCurrentUser();
            when(invitationRepository.findByInvitationToken("nope")).thenReturn(Optional.empty());

            ResponseEntity<?> response = controller.rejectInvitation("nope");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(body(response)).containsEntry("error", "Invitation not found");
            verify(invitationRepository, never()).save(any());
        }

        @Test
        @DisplayName("invitation addressed to someone else maps to 403 (security)")
        void wrongRecipient_forbidden() {
            stubCurrentUser();
            TeamInvitation inv =
                    invitation(
                            7L,
                            team(10L, "Acme"),
                            user(2L, "leader", "lead@x.com"),
                            "someone-else@x.com",
                            InvitationStatus.PENDING);
            when(invitationRepository.findByInvitationToken("tok-7")).thenReturn(Optional.of(inv));

            ResponseEntity<?> response = controller.rejectInvitation("tok-7");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(body(response))
                    .containsEntry(
                            "error", "You cannot reject an invitation that was not sent to you");
            verify(invitationRepository, never()).save(any());
        }

        @Test
        @DisplayName("non-pending invitation maps to 403 (illegal state)")
        void nonPending_forbidden() {
            stubCurrentUser();
            TeamInvitation inv =
                    invitation(
                            8L,
                            team(10L, "Acme"),
                            user(2L, "leader", "lead@x.com"),
                            CURRENT_EMAIL,
                            InvitationStatus.ACCEPTED);
            when(invitationRepository.findByInvitationToken("tok-8")).thenReturn(Optional.of(inv));

            ResponseEntity<?> response = controller.rejectInvitation("tok-8");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(body(response))
                    .containsEntry("error", "Can only reject pending invitations");
            verify(invitationRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("cancelInvitation")
    class CancelInvitation {

        @Test
        @DisplayName("leader cancels a pending invitation -> 200 and status CANCELLED")
        void happyPath() {
            stubCurrentUser();
            Team team = team(10L, "Acme");
            TeamInvitation inv =
                    invitation(11L, team, currentUser, "bob@x.com", InvitationStatus.PENDING);
            when(invitationRepository.findById(11L)).thenReturn(Optional.of(inv));
            TeamMembership leaderMembership = membership(team, currentUser, TeamRole.LEADER);
            when(membershipRepository.findByTeamIdAndUserId(10L, currentUser.getId()))
                    .thenReturn(Optional.of(leaderMembership));

            ResponseEntity<?> response = controller.cancelInvitation(11L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("message", "Invitation cancelled");
            assertThat(inv.getStatus()).isEqualTo(InvitationStatus.CANCELLED);
            verify(invitationRepository).save(inv);
        }

        @Test
        @DisplayName("missing invitation -> 404")
        void notFound() {
            stubCurrentUser();
            when(invitationRepository.findById(11L)).thenReturn(Optional.empty());

            ResponseEntity<?> response = controller.cancelInvitation(11L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(body(response)).containsEntry("error", "Invitation not found");
        }

        @Test
        @DisplayName("caller not a member of the team -> 403")
        void notAMember_forbidden() {
            stubCurrentUser();
            Team team = team(10L, "Acme");
            TeamInvitation inv =
                    invitation(11L, team, currentUser, "bob@x.com", InvitationStatus.PENDING);
            when(invitationRepository.findById(11L)).thenReturn(Optional.of(inv));
            when(membershipRepository.findByTeamIdAndUserId(10L, currentUser.getId()))
                    .thenReturn(Optional.empty());

            ResponseEntity<?> response = controller.cancelInvitation(11L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(body(response)).containsEntry("error", "You are not a member of this team");
            verify(invitationRepository, never()).save(any());
        }

        @Test
        @DisplayName("member but not leader -> 403")
        void memberNotLeader_forbidden() {
            stubCurrentUser();
            Team team = team(10L, "Acme");
            TeamInvitation inv =
                    invitation(11L, team, currentUser, "bob@x.com", InvitationStatus.PENDING);
            when(invitationRepository.findById(11L)).thenReturn(Optional.of(inv));
            when(membershipRepository.findByTeamIdAndUserId(10L, currentUser.getId()))
                    .thenReturn(Optional.of(membership(team, currentUser, TeamRole.MEMBER)));

            ResponseEntity<?> response = controller.cancelInvitation(11L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(body(response))
                    .containsEntry("error", "Only team leaders can cancel invitations");
            verify(invitationRepository, never()).save(any());
        }

        @Test
        @DisplayName("non-pending invitation -> 403 (illegal state)")
        void nonPending_forbidden() {
            stubCurrentUser();
            Team team = team(10L, "Acme");
            TeamInvitation inv =
                    invitation(11L, team, currentUser, "bob@x.com", InvitationStatus.CANCELLED);
            when(invitationRepository.findById(11L)).thenReturn(Optional.of(inv));
            when(membershipRepository.findByTeamIdAndUserId(10L, currentUser.getId()))
                    .thenReturn(Optional.of(membership(team, currentUser, TeamRole.LEADER)));

            ResponseEntity<?> response = controller.cancelInvitation(11L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(body(response))
                    .containsEntry("error", "Can only cancel pending invitations");
            verify(invitationRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("getPendingInvitations")
    class GetPendingInvitations {

        @Test
        @DisplayName("returns DTOs for the current user's pending invitations")
        void happyPath() {
            stubCurrentUser();
            Team team = team(10L, "Acme");
            TeamInvitation inv =
                    invitation(
                            20L,
                            team,
                            user(2L, "leader", "lead@x.com"),
                            CURRENT_EMAIL,
                            InvitationStatus.PENDING);
            when(invitationRepository.findPendingInvitationsByEmail(eq(CURRENT_EMAIL), any()))
                    .thenReturn(List.of(inv));

            ResponseEntity<?> response = controller.getPendingInvitations();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            @SuppressWarnings("unchecked")
            List<SaasTeamController.InvitationDTO> dtos =
                    (List<SaasTeamController.InvitationDTO>) response.getBody();
            assertThat(dtos).hasSize(1);
            assertThat(dtos.get(0).getInvitationId()).isEqualTo(20L);
            assertThat(dtos.get(0).getInviteeEmail()).isEqualTo(CURRENT_EMAIL);
        }

        @Test
        @DisplayName("empty list returns 200 with an empty body")
        void empty() {
            stubCurrentUser();
            when(invitationRepository.findPendingInvitationsByEmail(eq(CURRENT_EMAIL), any()))
                    .thenReturn(List.of());

            ResponseEntity<?> response = controller.getPendingInvitations();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat((List<?>) response.getBody()).isEmpty();
        }

        @Test
        @DisplayName("repository failure maps to 500")
        void repoFailure_isServerError() {
            stubCurrentUser();
            when(invitationRepository.findPendingInvitationsByEmail(anyString(), any()))
                    .thenThrow(new RuntimeException("db down"));

            ResponseEntity<?> response = controller.getPendingInvitations();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(body(response)).containsEntry("error", "Failed to fetch invitations");
        }
    }

    @Nested
    @DisplayName("getMyTeams")
    class GetMyTeams {

        @Test
        @DisplayName(
                "no memberships -> personal team created, then memberships re-fetched and returned")
        void noMemberships_createsPersonalTeam() {
            stubCurrentUser();
            Team personal = team(1L, "My Team");
            when(membershipRepository.findByUserId(currentUser.getId()))
                    .thenReturn(List.of()) // first call: empty
                    .thenReturn(List.of(membership(personal, currentUser, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(personal)).thenReturn(true);
            when(saasTeamExtensionService.getTeamType(personal)).thenReturn("PERSONAL");
            when(membershipRepository.countByTeamId(1L)).thenReturn(1L);
            when(saasTeamExtensionService.getMaxSeats(personal)).thenReturn(1);
            when(saasTeamExtensionService.getSeatsUsed(personal)).thenReturn(1);

            ResponseEntity<?> response = controller.getMyTeams();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(saasTeamService).createPersonalTeam(currentUser);
            @SuppressWarnings("unchecked")
            List<SaasTeamController.TeamDetailsDTO> dtos =
                    (List<SaasTeamController.TeamDetailsDTO>) response.getBody();
            assertThat(dtos).hasSize(1);
            assertThat(dtos.get(0).getTeamId()).isEqualTo(1L);
            assertThat(dtos.get(0).getIsPersonal()).isTrue();
            assertThat(dtos.get(0).getIsLeader()).isTrue();
            assertThat(dtos.get(0).getMemberCount()).isEqualTo(1);
            assertThat(dtos.get(0).getMaxSeats()).isEqualTo(1);
        }

        @Test
        @DisplayName("already has a personal team -> no migration, returns existing teams")
        void existingPersonalTeam_noMigration() {
            stubCurrentUser();
            Team personal = team(1L, "My Team");
            when(membershipRepository.findByUserId(currentUser.getId()))
                    .thenReturn(List.of(membership(personal, currentUser, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(personal)).thenReturn(true);
            when(saasTeamExtensionService.getTeamType(personal)).thenReturn("PERSONAL");
            when(membershipRepository.countByTeamId(1L)).thenReturn(1L);
            when(saasTeamExtensionService.getMaxSeats(personal)).thenReturn(1);
            when(saasTeamExtensionService.getSeatsUsed(personal)).thenReturn(1);

            ResponseEntity<?> response = controller.getMyTeams();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(saasTeamService, never()).createPersonalTeam(any());
        }

        @Test
        @DisplayName("only on legacy Default team -> migrates to a personal team")
        void onlyOnDefaultTeam_migrates() {
            stubCurrentUser();
            Team legacy = team(2L, "Default");
            Team personal = team(1L, "My Team");
            when(membershipRepository.findByUserId(currentUser.getId()))
                    .thenReturn(List.of(membership(legacy, currentUser, TeamRole.MEMBER)))
                    .thenReturn(List.of(membership(personal, currentUser, TeamRole.LEADER)));
            // Team equals() (Lombok onlyExplicitlyIncluded with no fields) treats all Team
            // instances as equal, so isPersonal cannot be stubbed per-instance. The legacy team
            // being non-personal plus the "Default" name is what triggers migration here.
            when(saasTeamExtensionService.isPersonal(any(Team.class))).thenReturn(false);
            when(saasTeamExtensionService.getTeamType(any(Team.class))).thenReturn("STANDARD");
            when(membershipRepository.countByTeamId(anyLong())).thenReturn(1L);
            when(saasTeamExtensionService.getMaxSeats(any(Team.class))).thenReturn(1);
            when(saasTeamExtensionService.getSeatsUsed(any(Team.class))).thenReturn(1);

            ResponseEntity<?> response = controller.getMyTeams();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(saasTeamService).createPersonalTeam(currentUser);
        }

        @Test
        @DisplayName("on a real (non-system, non-personal) team -> no migration")
        void onRealTeam_noMigration() {
            stubCurrentUser();
            Team realTeam = team(3L, "Engineering");
            when(membershipRepository.findByUserId(currentUser.getId()))
                    .thenReturn(List.of(membership(realTeam, currentUser, TeamRole.MEMBER)));
            when(saasTeamExtensionService.isPersonal(realTeam)).thenReturn(false);
            when(saasTeamExtensionService.getTeamType(realTeam)).thenReturn("STANDARD");
            when(membershipRepository.countByTeamId(3L)).thenReturn(4L);
            when(saasTeamExtensionService.getMaxSeats(realTeam)).thenReturn(10);
            when(saasTeamExtensionService.getSeatsUsed(realTeam)).thenReturn(4);

            ResponseEntity<?> response = controller.getMyTeams();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(saasTeamService, never()).createPersonalTeam(any());
            @SuppressWarnings("unchecked")
            List<SaasTeamController.TeamDetailsDTO> dtos =
                    (List<SaasTeamController.TeamDetailsDTO>) response.getBody();
            assertThat(dtos.get(0).getIsLeader()).isFalse();
            assertThat(dtos.get(0).getMemberCount()).isEqualTo(4);
            assertThat(dtos.get(0).getMaxSeats()).isEqualTo(10);
            assertThat(dtos.get(0).getSeatsUsed()).isEqualTo(4);
        }

        @Test
        @DisplayName("personal-team creation failure surfaces as 500")
        void createPersonalTeamFails_isServerError() {
            stubCurrentUser();
            when(membershipRepository.findByUserId(currentUser.getId())).thenReturn(List.of());
            when(saasTeamService.createPersonalTeam(currentUser))
                    .thenThrow(new RuntimeException("insert failed"));

            ResponseEntity<?> response = controller.getMyTeams();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(body(response)).containsEntry("error", "Failed to fetch teams");
        }
    }

    @Nested
    @DisplayName("getTeamMembers")
    class GetTeamMembers {

        @Test
        @DisplayName("returns member DTOs for the team")
        void happyPath() {
            Team team = team(10L, "Acme");
            User bob = user(2L, "bob", "bob@x.com");
            when(membershipRepository.findByTeamId(10L))
                    .thenReturn(List.of(membership(team, bob, TeamRole.MEMBER)));

            ResponseEntity<?> response = controller.getTeamMembers(10L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            @SuppressWarnings("unchecked")
            List<SaasTeamController.TeamMemberDTO> dtos =
                    (List<SaasTeamController.TeamMemberDTO>) response.getBody();
            assertThat(dtos).hasSize(1);
            assertThat(dtos.get(0).getId()).isEqualTo(2L);
            assertThat(dtos.get(0).getUsername()).isEqualTo("bob");
            assertThat(dtos.get(0).getRole()).isEqualTo("MEMBER");
        }

        @Test
        @DisplayName("repository failure maps to 500")
        void repoFailure_isServerError() {
            when(membershipRepository.findByTeamId(10L)).thenThrow(new RuntimeException("db"));

            ResponseEntity<?> response = controller.getTeamMembers(10L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(body(response)).containsEntry("error", "Failed to fetch team members");
        }
    }

    @Nested
    @DisplayName("getTeamInvitations")
    class GetTeamInvitations {

        @Test
        @DisplayName("returns invitation DTOs for the team")
        void happyPath() {
            Team team = team(10L, "Acme");
            TeamInvitation inv =
                    invitation(30L, team, currentUser, "bob@x.com", InvitationStatus.PENDING);
            when(invitationRepository.findByTeamId(10L)).thenReturn(List.of(inv));

            ResponseEntity<?> response = controller.getTeamInvitations(10L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            @SuppressWarnings("unchecked")
            List<SaasTeamController.InvitationDTO> dtos =
                    (List<SaasTeamController.InvitationDTO>) response.getBody();
            assertThat(dtos).hasSize(1);
            assertThat(dtos.get(0).getInvitationId()).isEqualTo(30L);
        }

        @Test
        @DisplayName("repository failure maps to 500")
        void repoFailure_isServerError() {
            when(invitationRepository.findByTeamId(10L)).thenThrow(new RuntimeException("db"));

            ResponseEntity<?> response = controller.getTeamInvitations(10L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(body(response)).containsEntry("error", "Failed to fetch invitations");
        }
    }

    @Nested
    @DisplayName("removeTeamMember")
    class RemoveTeamMember {

        @Test
        @DisplayName("removes member and revokes PRO role when the removed user was PRO")
        void happyPath_revokesProRole() throws Exception {
            stubCurrentUser();
            User proMember = user(2L, "bob", "bob@x.com");
            addRole(proMember, Role.PRO_USER.getRoleId());
            when(userRepository.findById(2L)).thenReturn(Optional.of(proMember));
            Team team = team(10L, "Acme");
            when(teamRepository.findById(10L)).thenReturn(Optional.of(team));

            ResponseEntity<?> response = controller.removeTeamMember(10L, 2L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("message", "Member removed successfully");
            verify(saasTeamService).removeTeamMember(10L, 2L, currentUser);
            verify(userService).changeRole(proMember, Role.USER.getRoleId());
        }

        @Test
        @DisplayName("non-PRO removed user is not downgraded")
        void happyPath_nonProUntouched() throws Exception {
            stubCurrentUser();
            User member = user(2L, "bob", "bob@x.com");
            addRole(member, Role.USER.getRoleId());
            when(userRepository.findById(2L)).thenReturn(Optional.of(member));
            when(teamRepository.findById(10L)).thenReturn(Optional.of(team(10L, "Acme")));

            ResponseEntity<?> response = controller.removeTeamMember(10L, 2L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(userService, never()).changeRole(any(), anyString());
        }

        @Test
        @DisplayName("member not found -> 400 and rollback")
        void memberNotFound_isBadRequest() {
            stubCurrentUser();
            TransactionSupport tx = TransactionSupport.bind();
            try {
                when(userRepository.findById(2L)).thenReturn(Optional.empty());

                ResponseEntity<?> response = controller.removeTeamMember(10L, 2L);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(body(response)).containsEntry("error", "Member not found");
                verify(tx.status()).setRollbackOnly();
            } finally {
                tx.unbind();
            }
        }

        @Test
        @DisplayName("service SecurityException -> 400 and rollback")
        void serviceSecurityException_isBadRequest() {
            stubCurrentUser();
            TransactionSupport tx = TransactionSupport.bind();
            try {
                when(userRepository.findById(2L))
                        .thenReturn(Optional.of(user(2L, "bob", "b@x.com")));
                when(teamRepository.findById(10L)).thenReturn(Optional.of(team(10L, "Acme")));
                doThrow(new SecurityException("Only team leaders can remove members"))
                        .when(saasTeamService)
                        .removeTeamMember(10L, 2L, currentUser);

                ResponseEntity<?> response = controller.removeTeamMember(10L, 2L);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(body(response))
                        .containsEntry("error", "Only team leaders can remove members");
                verify(tx.status()).setRollbackOnly();
            } finally {
                tx.unbind();
            }
        }

        @Test
        @DisplayName("unexpected error -> 500 and rollback")
        void unexpectedError_isServerError() {
            stubCurrentUser();
            TransactionSupport tx = TransactionSupport.bind();
            try {
                when(userRepository.findById(2L))
                        .thenReturn(Optional.of(user(2L, "bob", "b@x.com")));
                when(teamRepository.findById(10L)).thenReturn(Optional.of(team(10L, "Acme")));
                doThrow(new RuntimeException("boom"))
                        .when(saasTeamService)
                        .removeTeamMember(10L, 2L, currentUser);

                ResponseEntity<?> response = controller.removeTeamMember(10L, 2L);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                assertThat(body(response)).containsEntry("error", "Failed to remove member");
                verify(tx.status()).setRollbackOnly();
            } finally {
                tx.unbind();
            }
        }
    }

    @Nested
    @DisplayName("leaveTeam")
    class LeaveTeam {

        @Test
        @DisplayName("PRO user leaving has PRO role revoked")
        void happyPath_revokesProRole() throws Exception {
            stubCurrentUser();
            addRole(currentUser, Role.PRO_USER.getRoleId());
            when(teamRepository.findById(10L)).thenReturn(Optional.of(team(10L, "Acme")));

            ResponseEntity<?> response = controller.leaveTeam(10L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("message", "Left team successfully");
            verify(saasTeamService).leaveTeam(10L, currentUser);
            verify(userService).changeRole(currentUser, Role.USER.getRoleId());
        }

        @Test
        @DisplayName("non-PRO user leaving is not downgraded")
        void happyPath_nonProUntouched() throws Exception {
            stubCurrentUser();
            addRole(currentUser, Role.USER.getRoleId());
            when(teamRepository.findById(10L)).thenReturn(Optional.of(team(10L, "Acme")));

            ResponseEntity<?> response = controller.leaveTeam(10L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(userService, never()).changeRole(any(), anyString());
        }

        @Test
        @DisplayName("last-leader IllegalStateException -> 400 and rollback")
        void lastLeader_isBadRequest() {
            stubCurrentUser();
            TransactionSupport tx = TransactionSupport.bind();
            try {
                when(teamRepository.findById(10L)).thenReturn(Optional.of(team(10L, "Acme")));
                doThrow(new IllegalStateException("Cannot leave as the last team leader."))
                        .when(saasTeamService)
                        .leaveTeam(10L, currentUser);

                ResponseEntity<?> response = controller.leaveTeam(10L);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(body(response))
                        .containsEntry("error", "Cannot leave as the last team leader.");
                verify(tx.status()).setRollbackOnly();
            } finally {
                tx.unbind();
            }
        }

        @Test
        @DisplayName("unexpected error -> 500 and rollback")
        void unexpectedError_isServerError() {
            stubCurrentUser();
            TransactionSupport tx = TransactionSupport.bind();
            try {
                doThrow(new RuntimeException("boom")).when(teamRepository).findById(10L);

                ResponseEntity<?> response = controller.leaveTeam(10L);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                assertThat(body(response)).containsEntry("error", "Failed to leave team");
                verify(tx.status()).setRollbackOnly();
            } finally {
                tx.unbind();
            }
        }
    }

    @Nested
    @DisplayName("renameTeamByLeader")
    class RenameTeam {

        private RenameTeamRequest req(String name) {
            RenameTeamRequest r = new RenameTeamRequest();
            r.setNewName(name);
            return r;
        }

        @Test
        @DisplayName("happy path renames a standard team and trims the name")
        void happyPath() {
            stubCurrentUser();
            Team team = team(10L, "Old Name");
            when(teamRepository.findById(10L)).thenReturn(Optional.of(team));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(false);

            ResponseEntity<?> response = controller.renameTeamByLeader(10L, req("  New Name  "));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("message", "Team renamed successfully");
            assertThat(body(response)).containsEntry("newName", "New Name");
            assertThat(team.getName()).isEqualTo("New Name");
            verify(teamRepository).save(team);
        }

        @Test
        @DisplayName("blank name -> 400 before any lookup")
        void blankName_isBadRequest() {
            ResponseEntity<?> response = controller.renameTeamByLeader(10L, req("   "));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("error", "Team name cannot be empty");
            verify(teamRepository, never()).findById(anyLong());
        }

        @Test
        @DisplayName("null name -> 400")
        void nullName_isBadRequest() {
            ResponseEntity<?> response = controller.renameTeamByLeader(10L, req(null));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("error", "Team name cannot be empty");
        }

        @Test
        @DisplayName("team not found -> 400 with message")
        void teamNotFound_isBadRequest() {
            when(teamRepository.findById(10L)).thenReturn(Optional.empty());

            ResponseEntity<?> response = controller.renameTeamByLeader(10L, req("New"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("error", "Team not found");
        }

        @Test
        @DisplayName("personal team cannot be renamed -> 400")
        void personalTeam_isBadRequest() {
            Team team = team(10L, "My Team");
            when(teamRepository.findById(10L)).thenReturn(Optional.of(team));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(true);

            ResponseEntity<?> response = controller.renameTeamByLeader(10L, req("New"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("error", "Cannot rename personal team");
            verify(teamRepository, never()).save(any());
        }

        @Test
        @DisplayName("Internal team cannot be renamed -> 400")
        void internalTeam_isBadRequest() {
            Team team = team(10L, TeamService.INTERNAL_TEAM_NAME);
            when(teamRepository.findById(10L)).thenReturn(Optional.of(team));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(false);

            ResponseEntity<?> response = controller.renameTeamByLeader(10L, req("New"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("error", "Cannot rename Internal team");
            verify(teamRepository, never()).save(any());
        }

        @Test
        @DisplayName("persistence failure -> 500")
        void saveFailure_isServerError() {
            stubCurrentUser();
            Team team = team(10L, "Old");
            when(teamRepository.findById(10L)).thenReturn(Optional.of(team));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(false);
            when(teamRepository.save(team)).thenThrow(new RuntimeException("db"));

            ResponseEntity<?> response = controller.renameTeamByLeader(10L, req("New"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(body(response)).containsEntry("error", "Failed to rename team");
        }
    }

    @Nested
    @DisplayName("updateTeamSeats")
    class UpdateTeamSeats {

        private UpdateSeatsRequest req(Integer maxSeats) {
            UpdateSeatsRequest r = new UpdateSeatsRequest();
            r.setMaxSeats(maxSeats);
            return r;
        }

        @Test
        @DisplayName("happy path returns seat math (available = max - used)")
        void happyPath() {
            Team team = team(10L, "Acme");
            when(teamRepository.findById(10L)).thenReturn(Optional.of(team));
            when(saasTeamExtensionService.getMaxSeats(team)).thenReturn(10);
            when(saasTeamExtensionService.getSeatsUsed(team)).thenReturn(3);

            ResponseEntity<?> response = controller.updateTeamSeats(10L, req(10));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(saasTeamService).updateTeamSeats(10L, 10);
            assertThat(body(response)).containsEntry("success", true);
            assertThat(body(response)).containsEntry("teamId", 10L);
            assertThat(body(response)).containsEntry("maxSeats", 10);
            assertThat(body(response)).containsEntry("seatsUsed", 3);
            assertThat(body(response)).containsEntry("availableSeats", 7);
        }

        @Test
        @DisplayName("invalid seats (service IllegalArgumentException) -> 400")
        void invalidSeats_isBadRequest() {
            doThrow(new IllegalArgumentException("maxSeats must be at least 1"))
                    .when(saasTeamService)
                    .updateTeamSeats(10L, 0);

            ResponseEntity<?> response = controller.updateTeamSeats(10L, req(0));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("error", "maxSeats must be at least 1");
        }

        @Test
        @DisplayName("unexpected error -> 500")
        void unexpectedError_isServerError() {
            doThrow(new RuntimeException("boom")).when(saasTeamService).updateTeamSeats(10L, 5);

            ResponseEntity<?> response = controller.updateTeamSeats(10L, req(5));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(body(response)).containsEntry("error", "Failed to update team seats");
        }
    }

    @Nested
    @DisplayName("getUserPrimaryTeamBySupabaseId")
    class GetUserPrimaryTeam {

        @Test
        @DisplayName("happy path returns the user's primary team payload")
        void happyPath() {
            UUID uuid = UUID.randomUUID();
            User user = user(2L, "bob", "bob@x.com");
            user.setSupabaseId(uuid);
            Team primary = team(10L, "Acme");
            user.setTeam(primary);
            when(userRepository.findBySupabaseId(uuid)).thenReturn(Optional.of(user));
            when(saasTeamExtensionService.isPersonal(primary)).thenReturn(false);
            when(saasTeamExtensionService.getMaxSeats(primary)).thenReturn(10);

            ResponseEntity<?> response = controller.getUserPrimaryTeamBySupabaseId(uuid.toString());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("teamId", 10L);
            assertThat(body(response)).containsEntry("userId", 2L);
            assertThat(body(response)).containsEntry("supabaseUserId", uuid.toString());
            assertThat(body(response)).containsEntry("isPersonal", false);
            assertThat(body(response)).containsEntry("maxSeats", 10);
        }

        @Test
        @DisplayName("malformed UUID -> 400 generic message")
        void malformedUuid_isBadRequest() {
            ResponseEntity<?> response = controller.getUserPrimaryTeamBySupabaseId("not-a-uuid");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response))
                    .containsEntry("error", "Invalid UUID format or user not found");
        }

        @Test
        @DisplayName("unknown user -> 400 generic message")
        void unknownUser_isBadRequest() {
            UUID uuid = UUID.randomUUID();
            when(userRepository.findBySupabaseId(uuid)).thenReturn(Optional.empty());

            ResponseEntity<?> response = controller.getUserPrimaryTeamBySupabaseId(uuid.toString());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response))
                    .containsEntry("error", "Invalid UUID format or user not found");
        }

        @Test
        @DisplayName("user with no primary team -> 404")
        void noPrimaryTeam_isNotFound() {
            UUID uuid = UUID.randomUUID();
            User user = user(2L, "bob", "bob@x.com");
            user.setSupabaseId(uuid);
            user.setTeam(null);
            when(userRepository.findBySupabaseId(uuid)).thenReturn(Optional.of(user));

            ResponseEntity<?> response = controller.getUserPrimaryTeamBySupabaseId(uuid.toString());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(body(response)).containsEntry("error", "User has no primary team");
        }
    }

    @Nested
    @DisplayName("getTeamInfo")
    class GetTeamInfo {

        @Test
        @DisplayName("happy path: leader sees full payload with members and seat math")
        void happyPath_leader() {
            stubCurrentUser();
            Team team = team(10L, "Acme");
            when(teamRepository.findById(10L)).thenReturn(Optional.of(team));
            User bob = user(2L, "bob", "bob@x.com");
            when(membershipRepository.findByTeamId(10L))
                    .thenReturn(List.of(membership(team, bob, TeamRole.MEMBER)));
            when(membershipRepository.findByTeamIdAndUserId(10L, currentUser.getId()))
                    .thenReturn(Optional.of(membership(team, currentUser, TeamRole.LEADER)));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(false);
            when(saasTeamExtensionService.getMaxSeats(team)).thenReturn(10);
            when(saasTeamExtensionService.getSeatsUsed(team)).thenReturn(2);

            ResponseEntity<?> response = controller.getTeamInfo(10L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("teamId", 10L);
            assertThat(body(response)).containsEntry("name", "Acme");
            assertThat(body(response)).containsEntry("isPersonal", false);
            assertThat(body(response)).containsEntry("maxSeats", 10);
            assertThat(body(response)).containsEntry("seatsUsed", 2);
            assertThat(body(response)).containsEntry("availableSeats", 8);
            assertThat(body(response)).containsEntry("isLeader", true);
            assertThat(body(response)).containsKey("members");
        }

        @Test
        @DisplayName("non-leader member sees isLeader=false")
        void nonLeader() {
            stubCurrentUser();
            Team team = team(10L, "Acme");
            when(teamRepository.findById(10L)).thenReturn(Optional.of(team));
            when(membershipRepository.findByTeamId(10L)).thenReturn(List.of());
            when(membershipRepository.findByTeamIdAndUserId(10L, currentUser.getId()))
                    .thenReturn(Optional.of(membership(team, currentUser, TeamRole.MEMBER)));
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(false);
            when(saasTeamExtensionService.getMaxSeats(team)).thenReturn(5);
            when(saasTeamExtensionService.getSeatsUsed(team)).thenReturn(1);

            ResponseEntity<?> response = controller.getTeamInfo(10L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("isLeader", false);
        }

        @Test
        @DisplayName("no membership row -> isLeader defaults to false")
        void noMembershipRow_leaderFalse() {
            stubCurrentUser();
            Team team = team(10L, "Acme");
            when(teamRepository.findById(10L)).thenReturn(Optional.of(team));
            when(membershipRepository.findByTeamId(10L)).thenReturn(List.of());
            when(membershipRepository.findByTeamIdAndUserId(10L, currentUser.getId()))
                    .thenReturn(Optional.empty());
            when(saasTeamExtensionService.isPersonal(team)).thenReturn(false);
            when(saasTeamExtensionService.getMaxSeats(team)).thenReturn(5);
            when(saasTeamExtensionService.getSeatsUsed(team)).thenReturn(1);

            ResponseEntity<?> response = controller.getTeamInfo(10L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("isLeader", false);
        }

        @Test
        @DisplayName("team not found -> 404")
        void teamNotFound_isNotFound() {
            when(teamRepository.findById(10L)).thenReturn(Optional.empty());

            ResponseEntity<?> response = controller.getTeamInfo(10L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(body(response)).containsEntry("error", "Team not found");
        }

        @Test
        @DisplayName("unexpected error -> 500")
        void unexpectedError_isServerError() {
            when(teamRepository.findById(10L)).thenThrow(new RuntimeException("db"));

            ResponseEntity<?> response = controller.getTeamInfo(10L);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(body(response)).containsEntry("error", "Failed to fetch team info");
        }
    }

    @Nested
    @DisplayName("DTO value holders")
    class Dtos {

        @Test
        @DisplayName("TeamDetailsDTO wires constructor fields verbatim")
        void teamDetailsDto() {
            SaasTeamController.TeamDetailsDTO dto =
                    new SaasTeamController.TeamDetailsDTO(
                            1L, "Acme", "STANDARD", false, 3, 10, 4, 10, true);
            assertThat(dto.getTeamId()).isEqualTo(1L);
            assertThat(dto.getName()).isEqualTo("Acme");
            assertThat(dto.getTeamType()).isEqualTo("STANDARD");
            assertThat(dto.getIsPersonal()).isFalse();
            assertThat(dto.getMemberCount()).isEqualTo(3);
            assertThat(dto.getSeatCount()).isEqualTo(10);
            assertThat(dto.getSeatsUsed()).isEqualTo(4);
            assertThat(dto.getMaxSeats()).isEqualTo(10);
            assertThat(dto.getIsLeader()).isTrue();
        }

        @Test
        @DisplayName("InviteUserRequest is a mutable POJO")
        void inviteUserRequest() {
            InviteUserRequest r = new InviteUserRequest();
            r.setTeamId(5L);
            r.setEmail("x@y.com");
            assertThat(r.getTeamId()).isEqualTo(5L);
            assertThat(r.getEmail()).isEqualTo("x@y.com");
        }
    }

    // ===== shared test infrastructure =====

    private static void addRole(User user, String roleId) {
        // Authority's (String, User) ctor self-registers on the user's authority set.
        new stirling.software.proprietary.security.model.Authority(roleId, user);
    }

    /**
     * Binds a Spring transaction context to the current thread so {@code @Transactional} handlers
     * can call {@link TransactionAspectSupport#currentTransactionStatus()} on their error paths
     * without a live Spring transaction, and verify {@code setRollbackOnly()} on the resulting
     * status.
     *
     * <p>Spring's {@code TransactionInfo} type is {@code protected} and its {@code bindToThread()}
     * plus the backing {@code transactionInfoHolder} ThreadLocal are {@code private}, so the whole
     * binding is performed reflectively. {@link #unbind()} clears the ThreadLocal again so the
     * binding never leaks into sibling tests.
     */
    private static final class TransactionSupport {

        @SuppressWarnings("unchecked")
        private static final ThreadLocal<Object> HOLDER = resolveHolder();

        private final TransactionStatus status;

        private TransactionSupport(TransactionStatus status) {
            this.status = status;
            HOLDER.set(newTransactionInfo(status));
        }

        @SuppressWarnings("unchecked")
        private static ThreadLocal<Object> resolveHolder() {
            try {
                java.lang.reflect.Field field =
                        TransactionAspectSupport.class.getDeclaredField("transactionInfoHolder");
                field.setAccessible(true);
                return (ThreadLocal<Object>) field.get(null);
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException("Unable to access transactionInfoHolder", e);
            }
        }

        /**
         * Reflectively build a TransactionInfo exposing the given status (protected nested type).
         */
        private static Object newTransactionInfo(TransactionStatus status) {
            try {
                Class<?> infoClass =
                        Class.forName(
                                "org.springframework.transaction.interceptor."
                                        + "TransactionAspectSupport$TransactionInfo");
                java.lang.reflect.Constructor<?> ctor =
                        infoClass.getDeclaredConstructor(
                                org.springframework.transaction.PlatformTransactionManager.class,
                                org.springframework.transaction.interceptor.TransactionAttribute
                                        .class,
                                String.class);
                ctor.setAccessible(true);
                Object info = ctor.newInstance(null, null, "test");
                java.lang.reflect.Method newStatus =
                        infoClass.getDeclaredMethod(
                                "newTransactionStatus", TransactionStatus.class);
                newStatus.setAccessible(true);
                newStatus.invoke(info, status);
                return info;
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException("Unable to build TransactionInfo", e);
            }
        }

        static TransactionSupport bind() {
            return new TransactionSupport(mock(TransactionStatus.class));
        }

        TransactionStatus status() {
            return status;
        }

        void unbind() {
            HOLDER.remove();
        }
    }
}
