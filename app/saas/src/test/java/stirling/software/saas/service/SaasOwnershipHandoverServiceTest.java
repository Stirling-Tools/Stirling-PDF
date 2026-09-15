package stirling.software.saas.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.LocalDateTime;
import java.util.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.web.server.ResponseStatusException;

import jakarta.persistence.EntityManager;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.accountlink.CloudOwnershipStatus.State;
import stirling.software.proprietary.model.*;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.*;
import stirling.software.saas.accountlink.LinkedInstance;
import stirling.software.saas.accountlink.LinkedInstanceRepository;
import stirling.software.saas.payg.billing.*;
import stirling.software.saas.repository.TeamInvitationRepository;

class SaasOwnershipHandoverServiceTest {
    private final TeamRepository teams = mock(TeamRepository.class);
    private final TeamMembershipRepository memberships = mock(TeamMembershipRepository.class);
    private final LinkedInstanceRepository instances = mock(LinkedInstanceRepository.class);
    private final TeamBillingService billing = mock(TeamBillingService.class);
    private final SaasTeamService invitations = mock(SaasTeamService.class);
    private final SaasOwnershipService ownership = mock(SaasOwnershipService.class);
    private final SaasTeamExtensionService extensions = mock(SaasTeamExtensionService.class);
    private final EntityManager entities = mock(EntityManager.class);
    private final TeamInvitationRepository pending = mock(TeamInvitationRepository.class);
    private final SaasOwnershipHandoverService service =
            new SaasOwnershipHandoverService(
                    teams,
                    memberships,
                    instances,
                    billing,
                    invitations,
                    ownership,
                    extensions,
                    entities,
                    pending);
    private Team team;
    private TeamMembership leader;
    private TeamMembership target;

    @BeforeEach
    void setup() {
        team = new Team();
        team.setId(9L);
        team.setName("Acme");
        when(teams.findById(9L)).thenReturn(Optional.of(team));
        when(teams.lockById(9L)).thenReturn(Optional.of(team));
        leader = member(1L, "owner@example.com", TeamRole.LEADER);
        target = member(2L, "new@example.com", TeamRole.MEMBER);
        when(memberships.findByTeamId(9L)).thenReturn(List.of(leader, target));
        when(memberships.findByTeamIdAndUserId(9L, 1L)).thenReturn(Optional.of(leader));
        when(instances.countByTeamIdAndRevokedAtIsNull(9L)).thenReturn(3L);
        paid(false);
    }

    private TeamMembership member(Long id, String email, TeamRole role) {
        User user = new User();
        user.setId(id);
        user.setEmail(email);
        user.setTeam(team);
        user.setEnabled(true);
        TeamMembership row = new TeamMembership();
        row.setTeam(team);
        row.setUser(user);
        row.setRole(role);
        row.setAcceptedAt(LocalDateTime.now());
        return row;
    }

    private void paid(boolean subscribed) {
        when(billing.forTeam(9L))
                .thenReturn(
                        new TeamBillingContext(
                                subscribed,
                                subscribed ? "sub_existing" : null,
                                null,
                                null,
                                10,
                                5,
                                null,
                                "usd",
                                null,
                                null));
    }

    @ParameterizedTest(name = "paid={0}, account={1}, state={2}")
    @CsvSource({
        "false,no-account,NEEDS_MEMBERSHIP",
        "false,same-team,READY",
        "false,different-team,NEEDS_MEMBERSHIP",
        "true,no-account,NEEDS_MEMBERSHIP",
        "true,same-team,READY",
        "true,different-team,NEEDS_MEMBERSHIP"
    })
    void readinessForAllSixLinkedScenarios(boolean subscribed, String account, State expected) {
        paid(subscribed);
        if (account.equals("no-account"))
            when(memberships.findByTeamId(9L)).thenReturn(List.of(leader));
        if (account.equals("different-team")) {
            Team other = new Team();
            other.setId(99L);
            target.getUser().setTeam(other);
        }
        var result = service.status(9L, " NEW@example.com ");
        assertEquals(expected, result.state());
        assertEquals(subscribed, result.subscribed());
        assertEquals(3L, result.linkedInstances());
        verifyNoInteractions(ownership, invitations);
    }

    @Test
    void transferUsesExistingTeamAndDoesNotMutateBillingOrLinks() {
        LinkedInstance instance = new LinkedInstance();
        instance.setTeamId(9L);
        doAnswer(
                        invocation -> {
                            leader.setRole(TeamRole.MEMBER);
                            target.setRole(TeamRole.LEADER);
                            return null;
                        })
                .when(ownership)
                .transferFromInstance(9L, 2L, leader.getUser(), instance);
        assertEquals(
                State.TRANSFERRED,
                service.changeFromInstance(
                                instance, "new@example.com", 1L, leader.getUser(), "transfer")
                        .state());
        verify(ownership).transferFromInstance(9L, 2L, leader.getUser(), instance);
        verify(ownership, never()).transfer(anyLong(), anyLong(), any());
        verify(billing, atLeastOnce()).forTeam(9L);
        verify(instances, atLeastOnce()).countByTeamIdAndRevokedAtIsNull(9L);
        verifyNoMoreInteractions(billing, instances);
        verifyNoInteractions(invitations);
    }

    @Test
    void cloudEntryPointCannotOptIntoInstanceTransfer() {
        doThrow(
                        new ResponseStatusException(
                                org.springframework.http.HttpStatus.CONFLICT,
                                "START_TRANSFER_FROM_INSTANCE"))
                .when(ownership)
                .transfer(9L, 2L, leader.getUser());
        assertEquals(
                "START_TRANSFER_FROM_INSTANCE",
                assertThrows(
                                ResponseStatusException.class,
                                () ->
                                        service.change(
                                                9L,
                                                "new@example.com",
                                                1L,
                                                leader.getUser(),
                                                "transfer"))
                        .getReason());
        verify(ownership, never()).transferFromInstance(anyLong(), anyLong(), any(), any());
    }

    @Test
    void memberCannotTransferAndStaleLeaderCannotConfirm() {
        when(memberships.findByTeamIdAndUserId(9L, 2L)).thenReturn(Optional.of(target));
        assertEquals(
                "CLOUD_OWNER_REQUIRED",
                assertThrows(
                                ResponseStatusException.class,
                                () ->
                                        service.change(
                                                9L,
                                                "new@example.com",
                                                1L,
                                                target.getUser(),
                                                "transfer"))
                        .getReason());
        assertEquals(
                "CLOUD_OWNER_CHANGED",
                assertThrows(
                                ResponseStatusException.class,
                                () ->
                                        service.change(
                                                9L,
                                                "new@example.com",
                                                99L,
                                                leader.getUser(),
                                                "transfer"))
                        .getReason());
        verifyNoInteractions(ownership);
    }

    @Test
    void disabledOrUnacceptedRecipientCannotTakeOwnership() {
        target.getUser().setEnabled(false);
        assertEquals(State.NEEDS_MEMBERSHIP, service.status(9L, "new@example.com").state());
        target.getUser().setEnabled(true);
        target.setAcceptedAt(null);
        assertEquals(
                "MEMBERSHIP_REQUIRED",
                assertThrows(
                                ResponseStatusException.class,
                                () ->
                                        service.change(
                                                9L,
                                                "new@example.com",
                                                1L,
                                                leader.getUser(),
                                                "transfer"))
                        .getReason());
        verifyNoInteractions(ownership);
    }

    @Test
    void personalTeamCannotTransfer() {
        when(extensions.isPersonal(team)).thenReturn(true);
        assertEquals(
                "PERSONAL_TEAM",
                assertThrows(
                                ResponseStatusException.class,
                                () ->
                                        service.change(
                                                9L,
                                                "new@example.com",
                                                1L,
                                                leader.getUser(),
                                                "transfer"))
                        .getReason());
        verifyNoInteractions(ownership);
    }

    @Test
    void invitationUsesExistingAcceptanceRulesAndDoesNotTransfer() {
        when(memberships.findByTeamId(9L)).thenReturn(List.of(leader));
        service.change(9L, "NEW@example.com", 1L, leader.getUser(), "invite");
        verify(invitations).inviteUserToTeam(9L, "new@example.com", leader.getUser());
        verifyNoInteractions(ownership);
    }

    @Test
    void pendingInvitationCanBeRetriedWithoutSendingDuplicate() {
        when(memberships.findByTeamId(9L)).thenReturn(List.of(leader));
        when(pending.existsPendingInvitationByTeamIdAndEmail(9L, "new@example.com"))
                .thenReturn(true);
        service.change(9L, "new@example.com", 1L, leader.getUser(), "invite");
        verifyNoInteractions(invitations, ownership);
    }

    @Test
    void paidAccountOrSeatRejectionKeepsCurrentOwner() {
        when(memberships.findByTeamId(9L)).thenReturn(List.of(leader));
        when(invitations.inviteUserToTeam(9L, "new@example.com", leader.getUser()))
                .thenThrow(new IllegalArgumentException("paid account"));
        assertEquals(
                "INVITATION_BLOCKED",
                assertThrows(
                                ResponseStatusException.class,
                                () ->
                                        service.change(
                                                9L,
                                                "new@example.com",
                                                1L,
                                                leader.getUser(),
                                                "invite"))
                        .getReason());
        assertTrue(leader.isLeader());
        verifyNoInteractions(ownership);
    }
}
