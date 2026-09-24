package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.accountlink.*;
import stirling.software.proprietary.accountlink.CloudOwnershipStatus.State;
import stirling.software.proprietary.model.OrgOwner;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.*;
import stirling.software.proprietary.security.repository.OrgOwnerRepository;

class OwnershipHandoverServiceTest {
    private final OrgOwnerRepository owners = mock(OrgOwnerRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final DeviceCredentialRepository credentials = mock(DeviceCredentialRepository.class);
    private final AccountLinkClient cloud = mock(AccountLinkClient.class);
    private ObjectProvider<AccountLinkClient> provider;
    private OwnershipHandoverService service;
    private OrgOwner owner;
    private User successor;
    private DeviceCredential credential;
    private UsernamePasswordAuthenticationToken auth;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setup() {
        provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(cloud);
        service = new OwnershipHandoverService(owners, users, credentials, provider);
        owner = new OrgOwner();
        owner.setOwnerUserId(1L);
        owner.setOwnerUsername("owner");
        when(owners.lockOwner()).thenReturn(Optional.of(owner));
        User current = new User();
        current.setId(1L);
        current.setUsername("owner");
        current.setEnabled(true);
        current.setFirstLogin(false);
        current.addAuthority(new Authority(Role.ADMIN.getRoleId(), current));
        when(users.findById(1L)).thenReturn(Optional.of(current));
        auth = new UsernamePasswordAuthenticationToken(current, "", current.getAuthorities());
        successor = new User();
        successor.setId(2L);
        successor.setUsername("new-owner");
        successor.setEmail("new@example.com");
        successor.setEnabled(true);
        successor.setFirstLogin(false);
        when(users.findById(2L)).thenReturn(Optional.of(successor));
        credential = new DeviceCredential();
        credential.setDeviceId("device");
        credential.setDeviceSecret("secret");
        credential.setTeamId(9L);
    }

    @Test
    void disabledLinkingWithCredentialHasAnExplicitRecoveryReason() throws IOException {
        when(credentials.findCredential()).thenReturn(Optional.of(credential));
        when(provider.getIfAvailable()).thenReturn(null);
        assertEquals(
                "ACCOUNT_LINK_DISABLED",
                assertThrows(ResponseStatusException.class, () -> service.prepare(2L, auth))
                        .getReason());
        assertEquals(
                "ACCOUNT_LINK_DISABLED",
                assertThrows(
                                ResponseStatusException.class,
                                () -> service.validateCompletion(owner, 2L))
                        .getReason());
        assertNull(owner.getHandoverTargetId());
        verifyNoInteractions(cloud);
        verify(credentials, never()).deleteAll();
        when(provider.getIfAvailable()).thenReturn(cloud);
        linked(State.READY, false);
        assertNotNull(service.prepare(2L, auth).candidates());
    }

    @Test
    void disabledLinkingWithoutCredentialStillAllowsLocalTransfer() {
        when(provider.getIfAvailable()).thenReturn(null);
        assertDoesNotThrow(() -> service.validateCompletion(owner, 2L));
        assertNull(service.prepare(2L, auth).cloud());
        assertDoesNotThrow(() -> service.validateCompletion(owner, 2L));
        service.cancel(auth);
        assertNull(owner.getHandoverTargetId());
    }

    @Test
    void anotherPendingRecipientIsReportedBeforeValidatingAMissingTarget() {
        owner.setHandoverTargetId(2L);
        assertEquals(
                "HANDOVER_IN_PROGRESS",
                assertThrows(ResponseStatusException.class, () -> service.prepare(99L, auth))
                        .getReason());
        verify(users, never()).findById(99L);
    }

    @ParameterizedTest
    @CsvSource({
        "deleted,TARGET_UNAVAILABLE",
        "disabled,TARGET_UNAVAILABLE",
        "renamed,TARGET_CHANGED",
        "email,TARGET_CHANGED"
    })
    void changedRecipientCanStillBeCancelledBeforeCloudCommit(String change, String reason)
            throws IOException {
        linked(State.READY, false);
        prepareSelected();
        switch (change) {
            case "deleted" -> when(users.findById(2L)).thenReturn(Optional.empty());
            case "disabled" -> successor.setEnabled(false);
            case "renamed" -> successor.setUsername("changed");
            case "email" -> successor.setEmail("changed@example.com");
            default -> throw new AssertionError(change);
        }
        assertEquals(
                reason,
                assertThrows(ResponseStatusException.class, () -> service.prepare(2L, auth))
                        .getReason());
        service.cancel(auth);
        assertNull(owner.getHandoverTargetId());
        assertEquals(1L, owner.getOwnerUserId());
    }

    private CloudOwnershipStatus state(State state, boolean paid) {
        return new CloudOwnershipStatus(
                9L,
                "Team",
                state == State.TRANSFERRED ? 2L : 1L,
                state == State.NEEDS_MEMBERSHIP ? null : 2L,
                2,
                paid,
                state);
    }

    private void linked(State state, boolean paid) throws IOException {
        when(credentials.findCredential()).thenReturn(Optional.of(credential));
        when(cloud.ownershipCandidates(credential))
                .thenReturn(
                        new CloudOwnershipCandidates(
                                9L,
                                "Team",
                                java.util.List.of(
                                        new CloudOwnershipCandidates.Member(
                                                2L, "Cloud member", "new@example.com"))));
        when(cloud.ownership(
                        eq(credential),
                        eq("new@example.com"),
                        isNull(),
                        eq("status"),
                        isNull(),
                        nullable(Long.class)))
                .thenReturn(state(state, paid));
        when(cloud.ownership(
                        eq(credential),
                        eq("new@example.com"),
                        anyString(),
                        eq("transfer"),
                        anyLong(),
                        nullable(Long.class)))
                .thenReturn(state(State.TRANSFERRED, paid));
    }

    private OwnershipHandoverService.Status prepareSelected() {
        return service.prepare(
                2L, new OwnershipHandoverService.Selection(null, "new@example.com"), auth);
    }

    @Test
    void changedCloudAccountCanBeCancelledWithoutAbandoningACompletedTransfer() throws IOException {
        linked(State.READY, false);
        prepareSelected();
        when(cloud.ownership(credential, "new@example.com", null, "status", null, null))
                .thenReturn(
                        new CloudOwnershipStatus(
                                9L, "Team", 1L, null, 2, false, State.NEEDS_MEMBERSHIP));
        service.cancel(auth);
        assertNull(owner.getHandoverTargetId());
        when(cloud.ownership(credential, "new@example.com", null, "status", null, null))
                .thenReturn(state(State.READY, false));
        prepareSelected();
        when(cloud.ownership(credential, "new@example.com", null, "status", null, null))
                .thenReturn(
                        new CloudOwnershipStatus(
                                9L, "Team", 2L, null, 2, false, State.NEEDS_MEMBERSHIP));
        assertEquals(
                "FINISH_LOCAL_TRANSFER",
                assertThrows(ResponseStatusException.class, () -> service.cancel(auth))
                        .getReason());
        assertEquals(2L, owner.getHandoverTargetId());
    }

    @Test
    void linkedUserWithoutEmailCanBrowseWithoutStartingAHandover() throws IOException {
        linked(State.READY, false);
        successor.setEmail(null);
        var result = service.prepare(2L, auth);
        assertEquals(2L, result.candidates().members().getFirst().id());
        assertNull(result.cloud());
        assertNull(owner.getHandoverTargetId());
        assertNull(service.current(auth));
    }

    @Test
    void selectedCloudMemberIsPinnedIndependentlyOfTheLocalEmail() throws IOException {
        linked(State.READY, false);
        successor.setEmail(null);
        var result = service.prepare(2L, new OwnershipHandoverService.Selection(2L, null), auth);
        assertNull(result.targetEmail());
        assertEquals("new@example.com", result.cloudEmail());
        assertNull(successor.getEmail());
        assertEquals(2L, owner.getHandoverCloudUserId());
        service.changeCloud(auth, "Bearer human", "transfer");
        verify(cloud).ownership(credential, "new@example.com", "Bearer human", "transfer", 1L, 2L);
        assertThrows(
                ResponseStatusException.class,
                () -> service.prepare(2L, new OwnershipHandoverService.Selection(3L, null), auth));
    }

    @Test
    void rejectsMemberNotInLinkedTeamWithoutPersistingIntent() throws IOException {
        linked(State.READY, false);
        assertEquals(
                "CLOUD_TARGET_CHANGED",
                assertThrows(
                                ResponseStatusException.class,
                                () ->
                                        service.prepare(
                                                2L,
                                                new OwnershipHandoverService.Selection(123L, null),
                                                auth))
                        .getReason());
        assertNull(owner.getHandoverTargetId());
    }

    @Test
    void cannotPairTheLocalSuccessorWithTheCurrentCloudOwner() throws IOException {
        linked(State.TRANSFERRED, false);
        assertEquals(
                "CHOOSE_ANOTHER_CLOUD_USER",
                assertThrows(ResponseStatusException.class, this::prepareSelected).getReason());
        assertNull(owner.getHandoverTargetId());
    }

    @Test
    void invitationPinsTheAcceptedAccountBeforeTransfer() throws IOException {
        linked(State.NEEDS_MEMBERSHIP, true);
        successor.setEmail(null);
        prepareSelected();
        assertNull(owner.getHandoverCloudUserId());
        linked(State.READY, true);
        prepareSelected();
        assertEquals(2L, owner.getHandoverCloudUserId());
        service.changeCloud(auth, "Bearer human", "transfer");
        verify(cloud).ownership(credential, "new@example.com", "Bearer human", "transfer", 1L, 2L);
    }

    @Test
    void unlinkedNeedsNoCloudAccountAndPreservesOwnerUntilCompletion() {
        successor.setEmail(null);
        assertNull(service.prepare(2L, auth).cloud());
        service.validateCompletion(owner, 2L);
        assertEquals(1L, owner.getOwnerUserId());
        verifyNoInteractions(cloud);
    }

    @ParameterizedTest(name = "paid={0}, recipient={1}")
    @CsvSource({
        "false, no-account",
        "false, same-team",
        "false, different-team",
        "true, no-account",
        "true, same-team",
        "true, different-team"
    })
    void sixLinkedScenariosCannotCompleteBeforeCloudOwnership(boolean paid, String account)
            throws IOException {
        State readiness = account.equals("same-team") ? State.READY : State.NEEDS_MEMBERSHIP;
        linked(readiness, paid);
        assertEquals(readiness, prepareSelected().cloud().state());
        assertEquals(
                "CLOUD_TRANSFER_REQUIRED",
                assertThrows(
                                ResponseStatusException.class,
                                () -> service.validateCompletion(owner, 2L))
                        .getReason());
        assertEquals(1L, owner.getOwnerUserId());
        linked(State.TRANSFERRED, paid);
        service.validateCompletion(owner, 2L);
        assertEquals("device", owner.getHandoverDeviceId());
        assertEquals("secret", credential.getDeviceSecret());
    }

    @Test
    void directLocalEndpointCannotBypassPreparation() throws IOException {
        linked(State.READY, true);
        assertEquals(
                "PREPARE_HANDOVER_FIRST",
                assertThrows(
                                ResponseStatusException.class,
                                () -> service.validateCompletion(owner, 2L))
                        .getReason());
    }

    @Test
    void deviceCredentialAloneCannotTransferCloudOwnership() throws IOException {
        linked(State.READY, false);
        prepareSelected();
        assertEquals(
                "CLOUD_SIGN_IN_REQUIRED",
                assertThrows(
                                ResponseStatusException.class,
                                () -> service.changeCloud(auth, null, "transfer"))
                        .getReason());
        verify(cloud, never()).ownership(any(), any(), any(), eq("transfer"), any(), any());
    }

    @Test
    void humanBearerIsForwardedWithPinnedLeaderButNeverPersisted() throws IOException {
        linked(State.READY, true);
        prepareSelected();
        service.changeCloud(auth, "Bearer human", "transfer");
        verify(cloud).ownership(credential, "new@example.com", "Bearer human", "transfer", 1L, 2L);
        assertEquals(1L, owner.getHandoverLeaderId());
    }

    @Test
    void lostCloudResponseCanResumeWithoutOldLeadersBearer() throws IOException {
        linked(State.READY, true);
        prepareSelected();
        when(cloud.ownership(credential, "new@example.com", "Bearer human", "transfer", 1L, 2L))
                .thenThrow(new IOException("lost response"));
        assertThrows(
                ResponseStatusException.class,
                () -> service.changeCloud(auth, "Bearer human", "transfer"));
        linked(State.TRANSFERRED, true);
        assertEquals(State.TRANSFERRED, service.prepare(2L, auth).cloud().state());
        service.validateCompletion(owner, 2L);
        assertEquals(
                "FINISH_LOCAL_TRANSFER",
                assertThrows(ResponseStatusException.class, () -> service.cancel(auth))
                        .getReason());
    }

    @Test
    void changedRecipientOrLinkCannotComplete() throws IOException {
        linked(State.READY, true);
        prepareSelected();
        successor.setEmail("other@example.com");
        assertEquals(
                "TARGET_CHANGED",
                assertThrows(
                                ResponseStatusException.class,
                                () -> service.validateCompletion(owner, 2L))
                        .getReason());
        successor.setEmail("new@example.com");
        credential.setDeviceId("replacement");
        assertEquals(
                "LINK_CHANGED",
                assertThrows(
                                ResponseStatusException.class,
                                () -> service.validateCompletion(owner, 2L))
                        .getReason());
    }

    @Test
    void outageFailsClosedButPendingRecordCanStillBeDiscovered() throws IOException {
        linked(State.READY, false);
        prepareSelected();
        when(cloud.ownership(credential, "new@example.com", null, "status", null, 2L))
                .thenThrow(new IOException());
        assertThrows(ResponseStatusException.class, () -> service.validateCompletion(owner, 2L));
        assertEquals(2L, service.current(auth).targetId());
    }

    @Test
    void nonOwnerAndDisabledRecipientAreRejected() {
        var stranger = new UsernamePasswordAuthenticationToken("stranger", "", java.util.List.of());
        assertEquals(
                "ORG_OWNER_REQUIRED",
                assertThrows(ResponseStatusException.class, () -> service.prepare(2L, stranger))
                        .getReason());
        successor.setEnabled(false);
        assertEquals(
                "TARGET_UNAVAILABLE",
                assertThrows(ResponseStatusException.class, () -> service.prepare(2L, auth))
                        .getReason());
    }

    @ParameterizedTest
    @CsvSource({"401, invalid", "403, revoked", "404, CLOUD_TEAM_MISSING"})
    void authoritativeLostLinkAllowsCancellationButNeverCompletion(int code, String reason)
            throws IOException {
        linked(State.READY, true);
        prepareSelected();
        when(cloud.ownership(
                        eq(credential),
                        anyString(),
                        isNull(),
                        eq("status"),
                        isNull(),
                        nullable(Long.class)))
                .thenThrow(new AccountLinkClient.UpstreamException(code, "denied", reason));
        assertEquals(
                "LINK_REVOKED",
                assertThrows(
                                ResponseStatusException.class,
                                () -> service.validateCompletion(owner, 2L))
                        .getReason());
        service.cancel(auth);
        assertNull(owner.getHandoverTargetId());
        assertNull(owner.getHandoverCloudUserId());
        assertEquals(1L, owner.getOwnerUserId());
        verify(credentials, never()).delete(any());
    }

    @ParameterizedTest
    @CsvSource({"404, route_missing", "500, error", "503, outage", "409, CLOUD_TARGET_CHANGED"})
    void ambiguousFailureCannotAbandonHandover(int code, String reason) throws IOException {
        linked(State.READY, true);
        prepareSelected();
        when(cloud.ownership(credential, "new@example.com", null, "status", null, null))
                .thenThrow(new AccountLinkClient.UpstreamException(code, "unavailable", reason));
        assertThrows(ResponseStatusException.class, () -> service.cancel(auth));
        assertEquals(2L, owner.getHandoverTargetId());
    }

    @Test
    void cancelledRequestCannotDiscardHandoverDuringNetworkOutage() throws IOException {
        linked(State.READY, true);
        prepareSelected();
        when(cloud.ownership(credential, "new@example.com", null, "status", null, null))
                .thenThrow(new IOException("timeout"));
        assertThrows(ResponseStatusException.class, () -> service.cancel(auth));
        assertEquals(2L, owner.getHandoverTargetId());
    }

    @Test
    void browsingResumedCandidatesPreservesPinnedRecipient() throws IOException {
        linked(State.READY, false);
        prepareSelected();
        assertEquals(2L, service.members(auth).members().getFirst().id());
        assertEquals(2L, owner.getHandoverTargetId());
        assertEquals(2L, owner.getHandoverCloudUserId());
        assertEquals(1L, owner.getHandoverLeaderId());
    }

    @Test
    void mixedCaseOwnerCanPrepareReadAdvanceAndCancel() throws IOException {
        linked(State.READY, false);
        User principal = new User();
        principal.setId(1L);
        principal.setUsername("OwNeR");
        auth = new UsernamePasswordAuthenticationToken(principal, "", java.util.List.of());
        prepareSelected();
        assertEquals(2L, service.current(auth).targetId());
        assertEquals(1, service.members(auth).members().size());
        when(cloud.ownership(credential, "new@example.com", "Bearer human", "invite", 1L, 2L))
                .thenReturn(state(State.READY, false));
        service.changeCloud(auth, "Bearer human", "invite");
        service.cancel(auth);
        assertNull(owner.getHandoverTargetId());
    }

    @ParameterizedTest
    @CsvSource({"true", "false"})
    void caseVariantAdministratorCannotActAsOwner(boolean userPrincipal) {
        successor.setUsername("OWNER");
        successor.addAuthority(new Authority(Role.ADMIN.getRoleId(), successor));
        if (!userPrincipal) when(users.findByUsername("OWNER")).thenReturn(Optional.of(successor));
        var impersonator =
                new UsernamePasswordAuthenticationToken(
                        userPrincipal ? successor : "OWNER", "", successor.getAuthorities());
        assertEquals(
                403,
                assertThrows(ResponseStatusException.class, () -> service.prepare(2L, impersonator))
                        .getStatusCode()
                        .value());
        assertEquals(
                403,
                assertThrows(ResponseStatusException.class, () -> service.cancel(impersonator))
                        .getStatusCode()
                        .value());
        verifyNoInteractions(cloud, credentials);
        assertNull(owner.getHandoverTargetId());
    }

    @Test
    void namedPrincipalResolvesTheAuthenticatedAccountBeforeCheckingOwnership() {
        var current = users.findById(1L);
        when(users.findByUsername("owner")).thenReturn(current);
        var named = new UsernamePasswordAuthenticationToken("owner", "", java.util.List.of());
        assertNotNull(service.prepare(2L, named));
    }

    @Test
    void staleOwnerPrincipalCannotBypassCurrentAccountRestrictions() {
        users.findById(1L).orElseThrow().setEnabled(false);
        assertEquals(
                403,
                assertThrows(ResponseStatusException.class, () -> service.prepare(2L, auth))
                        .getStatusCode()
                        .value());
    }

    @Test
    void cancelBeforeCloudTransferClearsOnlyHandover() throws IOException {
        linked(State.READY, true);
        prepareSelected();
        successor.setEmail("updated@example.com");
        service.cancel(auth);
        assertNull(owner.getHandoverTargetId());
        assertEquals(1L, owner.getOwnerUserId());
        assertEquals("secret", credential.getDeviceSecret());
    }
}
