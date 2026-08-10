package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PairingServiceTest {

    @Mock private AccountLinkClient client;
    @Mock private PairingStateRepository stateRepo;
    @Mock private DeviceCredentialStore credentialStore;
    @Mock private EntitlementCache entitlementCache;

    private PairingService service;

    @BeforeEach
    void setUp() {
        service = new PairingService(client, stateRepo, credentialStore, entitlementCache, "1.4.2");
        when(stateRepo.save(any(PairingState.class))).thenAnswer(inv -> inv.getArgument(0));
        when(stateRepo.findState()).thenReturn(Optional.empty());
    }

    @Test
    void start_persistsTheDeviceCodeButOnlyExposesTheUserCode() throws IOException {
        when(client.pairStart("pdf-prod-01", "1.4.2"))
                .thenReturn(
                        new AccountLinkClient.PairStartResult(
                                "WXYZ-4821", "secret-device-code", "https://x/link", 600, 5));

        PairingService.PairingView view = service.start("pdf-prod-01");

        assertThat(view.phase()).isEqualTo("waiting");
        assertThat(view.userCode()).isEqualTo("WXYZ-4821");
        assertThat(view.verificationUri()).isEqualTo("https://x/link");
        // The view is what reaches the browser, so the polling secret must not be on it.
        assertThat(view.toString()).doesNotContain("secret-device-code");

        org.mockito.ArgumentCaptor<PairingState> saved =
                org.mockito.ArgumentCaptor.forClass(PairingState.class);
        verify(stateRepo).save(saved.capture());
        assertThat(saved.getValue().getDeviceCode()).isEqualTo("secret-device-code");
        assertThat(saved.getValue().getId()).isEqualTo(PairingState.SINGLETON_ID);
    }

    @Test
    void advance_storesTheCredentialAndClearsStateOnApproval() throws IOException {
        PairingState state = waiting();
        when(stateRepo.findState()).thenReturn(Optional.of(state));
        when(client.pairPoll("secret-device-code"))
                .thenReturn(
                        new AccountLinkClient.PairPollResult(
                                "approved",
                                new AccountLinkClient.RegisterResult("device-id", "secret", 7L)));

        PairingService.PairingView view = service.advance();

        assertThat(view.phase()).isEqualTo("linked");
        verify(credentialStore).save("device-id", "secret", 7L);
        verify(stateRepo).delete(state);
        verify(entitlementCache).invalidate();
    }

    @Test
    void advance_respectsTheAdvertisedInterval() throws IOException {
        PairingState state = waiting();
        state.setLastPolledAt(LocalDateTime.now());
        when(stateRepo.findState()).thenReturn(Optional.of(state));

        assertThat(service.advance().phase()).isEqualTo("waiting");
        // Several replicas can call this at once, so the shared row is what keeps us inside the
        // interval SaaS asked for.
        verify(client, never()).pairPoll(anyString());
    }

    @Test
    void advance_keepsWaitingWhenTheUpstreamPollFails() throws IOException {
        PairingState state = waiting();
        when(stateRepo.findState()).thenReturn(Optional.of(state));
        when(client.pairPoll(anyString())).thenThrow(new IOException("connect timed out"));

        // A dropped poll must not tear down a pairing the admin may be mid-approval on.
        assertThat(service.advance().phase()).isEqualTo("waiting");
        verify(stateRepo, never()).delete(any(PairingState.class));
        verify(credentialStore, never()).save(anyString(), anyString(), any());
    }

    @Test
    void advance_deniedAndExpiredClearTheStateWithoutLinking() throws IOException {
        PairingState denied = waiting();
        when(stateRepo.findState()).thenReturn(Optional.of(denied));
        when(client.pairPoll(anyString()))
                .thenReturn(new AccountLinkClient.PairPollResult("denied", null));
        assertThat(service.advance().phase()).isEqualTo("denied");

        PairingState unknown = waiting();
        when(stateRepo.findState()).thenReturn(Optional.of(unknown));
        when(client.pairPoll(anyString()))
                .thenReturn(new AccountLinkClient.PairPollResult("unknown", null));
        assertThat(service.advance().phase()).isEqualTo("expired");

        verify(credentialStore, never()).save(anyString(), anyString(), any());
    }

    @Test
    void advance_reportsExpiryLocallyWithoutCallingSaas() throws IOException {
        PairingState state = waiting();
        state.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        when(stateRepo.findState()).thenReturn(Optional.of(state));

        assertThat(service.advance().phase()).isEqualTo("expired");
        verify(client, never()).pairPoll(anyString());
    }

    @Test
    void advance_shortCircuitsOnceLinked() throws IOException {
        when(credentialStore.isLinked()).thenReturn(true);

        assertThat(service.advance().phase()).isEqualTo("linked");
        verify(client, never()).pairPoll(anyString());
    }

    @Test
    void advance_idleWhenNothingIsInFlight() {
        assertThat(service.advance().phase()).isEqualTo("idle");
    }

    private static PairingState waiting() {
        PairingState state = new PairingState();
        state.setId(PairingState.SINGLETON_ID);
        state.setUserCode("WXYZ-4821");
        state.setDeviceCode("secret-device-code");
        state.setVerificationUri("https://x/link");
        state.setIntervalSeconds(5);
        state.setStartedAt(LocalDateTime.now().minusSeconds(30));
        state.setExpiresAt(LocalDateTime.now().plusMinutes(9));
        return state;
    }
}
