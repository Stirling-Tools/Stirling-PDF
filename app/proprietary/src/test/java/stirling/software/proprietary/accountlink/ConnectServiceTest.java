package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.proprietary.accountlink.AccountLinkClient.ConnectClaimOutcome;
import stirling.software.proprietary.accountlink.AccountLinkClient.ConnectClaimResult;
import stirling.software.proprietary.accountlink.AccountLinkClient.ConnectRequestResult;
import stirling.software.proprietary.accountlink.ConnectService.Phase;

/**
 * Unit tests for the instance half of the connect handshake. The properties that matter: the
 * callback we advertise is our own address, the nonce is the only thing that lets a callback finish
 * the handshake, and a callback we cannot verify changes nothing at all.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConnectServiceTest {

    private static final String NONCE = "the-nonce";
    private static final String CLAIM_SECRET = "the-claim-secret";

    @Mock private AccountLinkClient client;
    @Mock private ConnectStateRepository stateRepo;
    @Mock private DeviceCredentialStore credentialStore;
    @Mock private EntitlementCache entitlementCache;

    private AccountLinkProperties properties;
    private ConnectService service;

    @BeforeEach
    void setUp() {
        properties = new AccountLinkProperties();
        properties.setSaasBaseUrl("https://api.example.com");
        service =
                new ConnectService(
                        client, stateRepo, credentialStore, entitlementCache, properties);
    }

    // ---------------------------------------------------------------------------------------
    // Starting a handshake
    // ---------------------------------------------------------------------------------------

    @Test
    void start_advertisesTheConfiguredPublicUrlInPreferenceToTheRequest() throws Exception {
        properties.setPublicUrl("https://pdf.example.com/");
        stubCreate();

        service.start("prod-1", "http://10.0.0.5:8080");

        verify(client)
                .connectRequest(
                        anyString(),
                        // Trailing slash trimmed, and the request's own view ignored.
                        org.mockito.ArgumentMatchers.eq(
                                "https://pdf.example.com" + ConnectService.CALLBACK_PATH),
                        anyString(),
                        anyString());
    }

    @Test
    void start_fallsBackToTheAddressTheRequestArrivedOn() throws Exception {
        stubCreate();

        service.start(null, "https://pdf.internal:8443/stirling");

        ArgumentCaptor<String> callback = ArgumentCaptor.forClass(String.class);
        verify(client).connectRequest(any(), callback.capture(), anyString(), anyString());
        // Context path preserved, so a subpath deployment gets a callback that resolves.
        assertThat(callback.getValue())
                .isEqualTo("https://pdf.internal:8443/stirling" + ConnectService.CALLBACK_PATH);
    }

    @Test
    void start_withNoAddressAtAllFailsRatherThanGuessing() {
        assertThat(catchIo(() -> service.start(null, null))).hasMessageContaining("public-url");
        verifyNoInteractions(client);
    }

    @Test
    void start_pointsTheAdminAtTheWebAppNotTheApi() throws Exception {
        properties.setAppBaseUrl("https://app.example.com");
        stubCreate();

        ConnectService.ConnectStatus status = service.start(null, "https://pdf.example.com");

        assertThat(status.phase()).isEqualTo(Phase.PENDING);
        assertThat(status.authorizeUrl()).isEqualTo("https://app.example.com/link?request=req-1");
    }

    @Test
    void start_withoutAWebAppUrlFallsBackToTheApiBase() throws Exception {
        stubCreate();

        ConnectService.ConnectStatus status = service.start(null, "https://pdf.example.com");

        assertThat(status.authorizeUrl()).isEqualTo("https://api.example.com/link?request=req-1");
    }

    @Test
    void start_keepsTheNonceAndClaimSecretItSent() throws Exception {
        stubCreate();

        service.start(null, "https://pdf.example.com");

        ArgumentCaptor<String> nonce = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> secret = ArgumentCaptor.forClass(String.class);
        verify(client).connectRequest(any(), anyString(), nonce.capture(), secret.capture());

        ArgumentCaptor<ConnectState> saved = ArgumentCaptor.forClass(ConnectState.class);
        verify(stateRepo).save(saved.capture());
        assertThat(saved.getValue().getNonce()).isEqualTo(nonce.getValue());
        assertThat(saved.getValue().getClaimSecret()).isEqualTo(secret.getValue());
        // Two independent secrets, not one value used twice.
        assertThat(nonce.getValue()).isNotEqualTo(secret.getValue());
    }

    @Test
    void start_whenAlreadyLinkedDoesNothing() throws Exception {
        when(credentialStore.isLinked()).thenReturn(true);
        when(credentialStore.get()).thenReturn(Optional.of(credential(7L)));

        ConnectService.ConnectStatus status = service.start(null, "https://pdf.example.com");

        assertThat(status.phase()).isEqualTo(Phase.LINKED);
        verifyNoInteractions(client);
        verify(stateRepo, never()).save(any());
    }

    // ---------------------------------------------------------------------------------------
    // Finishing a handshake
    // ---------------------------------------------------------------------------------------

    @Test
    void complete_withTheRightNonceStoresTheCredentialAndClearsTheHandshake() {
        ConnectState state = openHandshake();
        when(stateRepo.findById(ConnectState.SINGLETON_ID)).thenReturn(Optional.of(state));
        when(client.connectClaim("req-1", CLAIM_SECRET))
                .thenReturn(new ConnectClaimResult(ConnectClaimOutcome.GRANTED, "dev", "sec", 7L));

        ConnectService.ConnectStatus status = service.complete(NONCE);

        assertThat(status.phase()).isEqualTo(Phase.LINKED);
        assertThat(status.teamId()).isEqualTo(7L);
        verify(credentialStore).save("dev", "sec", 7L);
        verify(entitlementCache).invalidate();
        verify(stateRepo).delete(state);
    }

    @Test
    void complete_withAWrongNonceClaimsNothingAndLeavesTheHandshakeAlone() {
        ConnectState state = openHandshake();
        when(stateRepo.findById(ConnectState.SINGLETON_ID)).thenReturn(Optional.of(state));

        ConnectService.ConnectStatus status = service.complete("not-the-nonce");

        assertThat(status.phase()).isEqualTo(Phase.REJECTED);
        // The important half: an unverified caller cannot cancel a legitimate handshake.
        verify(stateRepo, never()).delete(any());
        verifyNoInteractions(credentialStore);
        verify(client, never()).connectClaim(anyString(), anyString());
    }

    @Test
    void complete_withNoNonceAtAllIsRejected() {
        when(stateRepo.findById(ConnectState.SINGLETON_ID))
                .thenReturn(Optional.of(openHandshake()));

        assertThat(service.complete(null).phase()).isEqualTo(Phase.REJECTED);
        verify(client, never()).connectClaim(anyString(), anyString());
    }

    @Test
    void complete_whenSaaSHasNotCommittedTheApprovalKeepsTheHandshake() {
        when(stateRepo.findById(ConnectState.SINGLETON_ID))
                .thenReturn(Optional.of(openHandshake()));
        when(client.connectClaim(anyString(), anyString()))
                .thenReturn(ConnectClaimResult.of(ConnectClaimOutcome.PENDING));

        assertThat(service.complete(NONCE).phase()).isEqualTo(Phase.PENDING);
        verify(stateRepo, never()).delete(any());
    }

    @Test
    void complete_whenSaaSIsUnreachableKeepsTheHandshakeForARetry() {
        when(stateRepo.findById(ConnectState.SINGLETON_ID))
                .thenReturn(Optional.of(openHandshake()));
        when(client.connectClaim(anyString(), anyString()))
                .thenReturn(ConnectClaimResult.of(ConnectClaimOutcome.UNAVAILABLE));

        assertThat(service.complete(NONCE).phase()).isEqualTo(Phase.UNAVAILABLE);
        verify(stateRepo, never()).delete(any());
        verifyNoInteractions(credentialStore);
    }

    @Test
    void complete_whenDeclinedClearsTheHandshake() {
        ConnectState state = openHandshake();
        when(stateRepo.findById(ConnectState.SINGLETON_ID)).thenReturn(Optional.of(state));
        when(client.connectClaim(anyString(), anyString()))
                .thenReturn(ConnectClaimResult.of(ConnectClaimOutcome.REJECTED));

        assertThat(service.complete(NONCE).phase()).isEqualTo(Phase.REJECTED);
        verify(stateRepo).delete(state);
        verifyNoInteractions(credentialStore);
    }

    @Test
    void complete_onAnExpiredHandshakeClearsItWithoutClaiming() {
        ConnectState state = openHandshake();
        state.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        when(stateRepo.findById(ConnectState.SINGLETON_ID)).thenReturn(Optional.of(state));

        assertThat(service.complete(NONCE).phase()).isEqualTo(Phase.EXPIRED);
        verify(stateRepo).delete(state);
        verify(client, never()).connectClaim(anyString(), anyString());
    }

    // ---------------------------------------------------------------------------------------
    // Status
    // ---------------------------------------------------------------------------------------

    @Test
    void status_reportsNothingInFlightWhenThereIsNoHandshakeOrCredential() {
        assertThat(service.status().phase()).isEqualTo(Phase.NONE);
    }

    @Test
    void status_reportsAnExpiredHandshakeRatherThanOfferingAStaleLink() {
        ConnectState state = openHandshake();
        state.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        when(stateRepo.findById(ConnectState.SINGLETON_ID)).thenReturn(Optional.of(state));

        ConnectService.ConnectStatus status = service.status();

        assertThat(status.phase()).isEqualTo(Phase.EXPIRED);
        assertThat(status.authorizeUrl()).isNull();
    }

    @Test
    void status_countsDownWhileAHandshakeIsOpen() {
        when(stateRepo.findById(ConnectState.SINGLETON_ID))
                .thenReturn(Optional.of(openHandshake()));

        ConnectService.ConnectStatus status = service.status();

        assertThat(status.phase()).isEqualTo(Phase.PENDING);
        assertThat(status.secondsRemaining()).isPositive();
        assertThat(status.authorizeUrl()).isEqualTo("https://app.example.com/link?request=req-1");
    }

    // ---------------------------------------------------------------------------------------

    private void stubCreate() throws Exception {
        when(client.connectRequest(any(), anyString(), anyString(), anyString()))
                .thenReturn(new ConnectRequestResult("req-1", 900));
    }

    private static ConnectState openHandshake() {
        ConnectState state = new ConnectState();
        state.setId(ConnectState.SINGLETON_ID);
        state.setRequestId("req-1");
        state.setNonce(NONCE);
        state.setClaimSecret(CLAIM_SECRET);
        state.setCallbackUrl("https://pdf.example.com/account-link/callback");
        state.setAuthorizeUrl("https://app.example.com/link?request=req-1");
        state.setCreatedAt(LocalDateTime.now());
        state.setExpiresAt(LocalDateTime.now().plusMinutes(10));
        return state;
    }

    private static DeviceCredential credential(Long teamId) {
        DeviceCredential credential = new DeviceCredential();
        credential.setDeviceId("dev");
        credential.setDeviceSecret("sec");
        credential.setTeamId(teamId);
        credential.setLinkedAt(LocalDateTime.now());
        return credential;
    }

    /** Runs a throwing call and returns the exception, so the assertion reads in one line. */
    private static Throwable catchIo(ThrowingCall call) {
        try {
            call.run();
            throw new AssertionError("expected the call to fail");
        } catch (Exception e) {
            return e;
        }
    }

    private interface ThrowingCall {
        void run() throws Exception;
    }
}
