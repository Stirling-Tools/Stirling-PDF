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

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.accountlink.AccountLinkClient.ConnectClaimOutcome;
import stirling.software.proprietary.accountlink.AccountLinkClient.ConnectClaimResult;
import stirling.software.proprietary.accountlink.AccountLinkClient.ConnectRequestResult;
import stirling.software.proprietary.accountlink.ConnectService.Phase;

/** Unit tests for the instance half of the connect handshake. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConnectServiceTest {

    private static final String NONCE = "the-nonce";
    private static final String CLAIM_SECRET = "the-claim-secret";
    private static final String AUTHORIZE_URL = "https://app.example.com/link?request=req-1";

    @Mock private AccountLinkClient client;
    @Mock private ConnectStateRepository stateRepo;
    @Mock private DeviceCredentialStore credentialStore;
    @Mock private EntitlementCache entitlementCache;

    private ApplicationProperties applicationProperties;
    private ConnectService service;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        service =
                new ConnectService(
                        client,
                        stateRepo,
                        credentialStore,
                        entitlementCache,
                        applicationProperties);
    }

    private void configureFrontendUrl(String url) {
        applicationProperties.getSystem().setFrontendUrl(url);
    }

    @Test
    void start_advertisesTheConfiguredFrontendUrlInPreferenceToTheRequest() throws Exception {
        configureFrontendUrl("https://pdf.example.com/");
        stubCreate();

        service.start("prod-1", fromRequest("http://10.0.0.5:8080"));

        verify(client)
                .connectRequest(
                        anyString(),
                        // Trailing slash trimmed, and the request's own view ignored.
                        org.mockito.ArgumentMatchers.eq(
                                "https://pdf.example.com" + ConnectService.CALLBACK_PATH),
                        anyString(),
                        anyString(),
                        // A first link carries no credential; that is what makes it a first link.
                        org.mockito.ArgumentMatchers.isNull());
    }

    @Test
    void start_fallsBackToTheAddressTheRequestArrivedOn() throws Exception {
        stubCreate();

        service.start(null, fromRequest("https://pdf.internal:8443/stirling"));

        ArgumentCaptor<String> callback = ArgumentCaptor.forClass(String.class);
        verify(client).connectRequest(any(), callback.capture(), anyString(), anyString(), any());
        // Context path preserved, so a subpath deployment gets a callback that resolves.
        assertThat(callback.getValue())
                .isEqualTo("https://pdf.internal:8443/stirling" + ConnectService.CALLBACK_PATH);
    }

    @Test
    void start_withNoAddressAtAllFailsRatherThanGuessing() {
        assertThat(catchIo(() -> service.start(null, fromRequest(null))))
                .hasMessageContaining("system.frontendUrl");
        verifyNoInteractions(client);
    }

    @Test
    void resolveCallback_honoursThePortalsOwnCallbackWhenTheBrowserOriginAgrees() {
        // The frontend is the only party that knows its router's base path.
        String requested = "http://localhost:5173/app/account-link/callback";

        assertThat(
                        service.resolveCallbackUrl(
                                new ConnectService.CallbackHint(
                                        requested,
                                        "http://localhost:5173",
                                        "http://localhost:8080")))
                .isEqualTo(requested);
    }

    @Test
    void resolveCallback_ignoresACallbackFromADifferentOrigin() {
        assertThat(
                        service.resolveCallbackUrl(
                                new ConnectService.CallbackHint(
                                        "https://evil.example.com/steal",
                                        "http://localhost:5173",
                                        "http://localhost:8080")))
                .isEqualTo("http://localhost:5173" + ConnectService.CALLBACK_PATH);
    }

    @Test
    void resolveCallback_prefersTheBrowserOriginOverTheApiRequest() {
        // The whole point: :5173 is where the admin is, :8080 is where the call landed.
        assertThat(
                        service.resolveCallbackUrl(
                                new ConnectService.CallbackHint(
                                        null, "http://localhost:5173", "http://localhost:8080")))
                .isEqualTo("http://localhost:5173" + ConnectService.CALLBACK_PATH);
    }

    @Test
    void resolveCallback_letsConfigurationBeatEverything() {
        configureFrontendUrl("https://pdf.example.com/");

        assertThat(
                        service.resolveCallbackUrl(
                                new ConnectService.CallbackHint(
                                        "http://localhost:5173/account-link/callback",
                                        "http://localhost:5173",
                                        "http://localhost:8080")))
                .isEqualTo("https://pdf.example.com" + ConnectService.CALLBACK_PATH);
    }

    @Test
    void resolveCallback_ignoresAnUnusableOriginHeader() {
        // "null" is what a browser sends for an opaque origin; it must not become a callback.
        assertThat(
                        service.resolveCallbackUrl(
                                new ConnectService.CallbackHint(
                                        null, "null", "http://localhost:8080")))
                .isEqualTo("http://localhost:8080" + ConnectService.CALLBACK_PATH);
    }

    @Test
    void start_sendsTheAdminWhereverSaaSSaidToSendThem() throws Exception {
        stubCreate();

        ConnectService.ConnectStatus status =
                service.start(null, fromRequest("https://pdf.example.com"));

        assertThat(status.phase()).isEqualTo(Phase.PENDING);
        // Not composed here: only the SaaS side knows where its approval page lives, so an
        // instance configuring that could only get it wrong.
        assertThat(status.authorizeUrl()).isEqualTo(AUTHORIZE_URL);
    }

    @Test
    void start_keepsTheNonceAndClaimSecretItSent() throws Exception {
        stubCreate();

        service.start(null, fromRequest("https://pdf.example.com"));

        ArgumentCaptor<String> nonce = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> secret = ArgumentCaptor.forClass(String.class);
        verify(client).connectRequest(any(), anyString(), nonce.capture(), secret.capture(), any());

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

        ConnectService.ConnectStatus status =
                service.start(null, fromRequest("https://pdf.example.com"));

        assertThat(status.phase()).isEqualTo(Phase.LINKED);
        verifyNoInteractions(client);
        verify(stateRepo, never()).save(any());
    }

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

    @Test
    void startReauth_presentsTheCredentialSoSaaSCanPinTheTeam() throws Exception {
        when(credentialStore.get()).thenReturn(Optional.of(credential(7L)));
        when(client.connectRequest(any(), anyString(), anyString(), anyString(), any()))
                .thenReturn(new ConnectRequestResult("req-1", 900, AUTHORIZE_URL));

        service.startReauth(fromRequest("https://pdf.example.com"));

        // Sending the credential is what makes the pinning trustworthy: the team comes from
        // something only this instance holds.
        verify(client)
                .connectRequest(
                        any(),
                        anyString(),
                        anyString(),
                        anyString(),
                        org.mockito.ArgumentMatchers.argThat(
                                c -> c != null && "dev".equals(c.getDeviceId())));
    }

    @Test
    void startReauth_onAnUnlinkedServerFails() {
        assertThat(catchIo(() -> service.startReauth(fromRequest("https://pdf.example.com"))))
                .hasMessageContaining("not linked");
        verifyNoInteractions(client);
    }

    @Test
    void complete_onAConfirmedReauthKeepsTheExistingCredential() {
        ConnectState state = openHandshake();
        when(stateRepo.findById(ConnectState.SINGLETON_ID)).thenReturn(Optional.of(state));
        when(client.connectClaim(anyString(), anyString()))
                .thenReturn(new ConnectClaimResult(ConnectClaimOutcome.CONFIRMED, null, null, 7L));

        ConnectService.ConnectStatus status = service.complete(NONCE);

        assertThat(status.phase()).isEqualTo(Phase.LINKED);
        assertThat(status.teamId()).isEqualTo(7L);
        // Nothing to store: a second credential would orphan the one we already hold.
        verify(credentialStore, never()).save(anyString(), anyString(), any());
        verify(stateRepo).delete(state);
    }

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

    /** A start with nothing but the reconstructed request URL, as a headless caller would send. */
    private static ConnectService.CallbackHint fromRequest(String derivedBaseUrl) {
        return new ConnectService.CallbackHint(null, null, derivedBaseUrl);
    }

    private void stubCreate() throws Exception {
        // The five-argument overload: a first link passes a null credential rather than none.
        when(client.connectRequest(any(), anyString(), anyString(), anyString(), any()))
                .thenReturn(new ConnectRequestResult("req-1", 900, AUTHORIZE_URL));
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
