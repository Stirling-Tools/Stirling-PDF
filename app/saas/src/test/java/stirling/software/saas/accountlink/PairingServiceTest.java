package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PairingServiceTest {

    private static final Long TEAM = 7L;
    private static final Long USER = 42L;

    @Mock private PairingRequestRepository repo;
    @Mock private AccountLinkService accountLinkService;

    private PairingService service;

    @BeforeEach
    void setUp() {
        service = new PairingService(repo, accountLinkService);
        when(repo.findByUserCode(anyString())).thenReturn(Optional.empty());
        when(repo.save(any(PairingRequest.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void start_mintsCodesAndStoresOnlyTheDeviceCodeHash() {
        PairingService.StartResult result = service.start("pdf-prod-01", "1.4.2", "203.0.113.44");

        assertThat(result.userCode()).hasSize(8);
        // The alphabet deliberately excludes characters that are easy to confuse when a code is
        // read off one screen and typed on another.
        assertThat(result.userCode())
                .doesNotContainAnyWhitespaces()
                .matches("[A-HJ-KM-NP-TV-Z2-9]+");
        assertThat(result.deviceCode()).isNotBlank().isNotEqualTo(result.userCode());

        ArgumentCaptor<PairingRequest> saved = ArgumentCaptor.forClass(PairingRequest.class);
        verify(repo).save(saved.capture());
        PairingRequest row = saved.getValue();
        assertThat(row.getDeviceCodeHash())
                .isEqualTo(AccountLinkService.sha256Hex(result.deviceCode()))
                .isNotEqualTo(result.deviceCode());
        assertThat(row.getStatus()).isEqualTo(PairingRequest.Status.PENDING);
        assertThat(row.getInstanceLabel()).isEqualTo("pdf-prod-01");
        assertThat(row.getTeamId()).isNull();
    }

    @Test
    void start_refusesWhenOneAddressHasTooManyInFlight() {
        when(repo.countByRequesterIpAndCreatedAtAfter(eq("203.0.113.44"), any()))
                .thenReturn((long) PairingService.MAX_STARTS_PER_IP);

        org.junit.jupiter.api.Assertions.assertThrows(
                PairingService.TooManyRequestsException.class,
                () -> service.start("x", "1.0", "203.0.113.44"));
        verify(repo, never()).save(any());
    }

    @Test
    void approve_bindsTheTeamButDoesNotMintYet() {
        PairingRequest row = pending("WXYZ4821");
        when(repo.findByUserCode("WXYZ4821")).thenReturn(Optional.of(row));

        assertThat(service.approve("wxyz-4821", TEAM, USER, "renamed")).isTrue();

        assertThat(row.getStatus()).isEqualTo(PairingRequest.Status.APPROVED);
        assertThat(row.getTeamId()).isEqualTo(TEAM);
        assertThat(row.getApprovedByUserId()).isEqualTo(USER);
        assertThat(row.getInstanceLabel()).isEqualTo("renamed");
        // Minting happens on the poll that presents the device code, so the secret only ever
        // reaches the party that started the pairing.
        verify(accountLinkService, never()).register(anyLong(), anyLong(), anyString());
    }

    @Test
    void approve_acceptsAnyCasingAndSeparator() {
        PairingRequest row = pending("WXYZ4821");
        when(repo.findByUserCode("WXYZ4821")).thenReturn(Optional.of(row));

        assertThat(service.approve(" wxyz 4821 ", TEAM, USER, null)).isTrue();
    }

    @Test
    void approve_rejectsAnExpiredCode() {
        PairingRequest row = pending("WXYZ4821");
        row.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        when(repo.findByUserCode("WXYZ4821")).thenReturn(Optional.of(row));

        assertThat(service.approve("WXYZ4821", TEAM, USER, null)).isFalse();
        assertThat(row.getStatus()).isEqualTo(PairingRequest.Status.PENDING);
    }

    @Test
    void poll_pendingStaysPending() {
        PairingRequest row = pending("WXYZ4821");
        when(repo.findByDeviceCodeHashForUpdate(anyString())).thenReturn(Optional.of(row));

        assertThat(service.poll("device-code").outcome())
                .isEqualTo(PairingService.PollOutcome.PENDING);
        verify(accountLinkService, never()).register(anyLong(), anyLong(), anyString());
    }

    @Test
    void poll_tooSoonAsksTheInstanceToSlowDown() {
        PairingRequest row = pending("WXYZ4821");
        row.setLastPolledAt(LocalDateTime.now());
        when(repo.findByDeviceCodeHashForUpdate(anyString())).thenReturn(Optional.of(row));

        assertThat(service.poll("device-code").outcome())
                .isEqualTo(PairingService.PollOutcome.SLOW_DOWN);
    }

    @Test
    void poll_approvedMintsOnceAndThenRefusesAReplay() {
        PairingRequest row = pending("WXYZ4821");
        row.setStatus(PairingRequest.Status.APPROVED);
        row.setTeamId(TEAM);
        row.setApprovedByUserId(USER);
        when(repo.findByDeviceCodeHashForUpdate(anyString())).thenReturn(Optional.of(row));
        when(accountLinkService.register(TEAM, USER, "pdf-prod-01"))
                .thenReturn(
                        new AccountLinkService.RegisteredInstance(1L, "device-id", "secret", null));

        PairingService.PollResult first = service.poll("device-code");
        assertThat(first.outcome()).isEqualTo(PairingService.PollOutcome.APPROVED);
        assertThat(first.credential().deviceSecret()).isEqualTo("secret");
        assertThat(first.teamId()).isEqualTo(TEAM);
        assertThat(row.getStatus()).isEqualTo(PairingRequest.Status.CONSUMED);

        // A replayed device code must not mint a second credential for one pairing.
        PairingService.PollResult replay = service.poll("device-code");
        assertThat(replay.outcome()).isEqualTo(PairingService.PollOutcome.UNKNOWN);
        assertThat(replay.credential()).isNull();
        verify(accountLinkService).register(TEAM, USER, "pdf-prod-01");
    }

    @Test
    void poll_deniedAndExpiredAndUnknownNeverMint() {
        PairingRequest denied = pending("AAAA1111");
        denied.setStatus(PairingRequest.Status.DENIED);
        when(repo.findByDeviceCodeHashForUpdate(anyString())).thenReturn(Optional.of(denied));
        assertThat(service.poll("d").outcome()).isEqualTo(PairingService.PollOutcome.DENIED);

        PairingRequest expired = pending("BBBB2222");
        expired.setStatus(PairingRequest.Status.APPROVED);
        expired.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        when(repo.findByDeviceCodeHashForUpdate(anyString())).thenReturn(Optional.of(expired));
        assertThat(service.poll("d").outcome()).isEqualTo(PairingService.PollOutcome.EXPIRED);

        when(repo.findByDeviceCodeHashForUpdate(anyString())).thenReturn(Optional.empty());
        assertThat(service.poll("d").outcome()).isEqualTo(PairingService.PollOutcome.UNKNOWN);
        assertThat(service.poll(null).outcome()).isEqualTo(PairingService.PollOutcome.UNKNOWN);

        verify(accountLinkService, never()).register(anyLong(), anyLong(), anyString());
    }

    @Test
    void lookup_exposesTheFactsAnApproverNeedsAndNoSecret() {
        PairingRequest row = pending("WXYZ4821");
        when(repo.findByUserCode("WXYZ4821")).thenReturn(Optional.of(row));

        PairingService.PendingView view = service.lookup("WXYZ-4821").orElseThrow();

        assertThat(view.instanceLabel()).isEqualTo("pdf-prod-01");
        assertThat(view.instanceVersion()).isEqualTo("1.4.2");
        assertThat(view.requesterIp()).isEqualTo("203.0.113.44");
        assertThat(view.userCode()).isEqualTo("WXYZ4821");
    }

    @Test
    void forDisplay_groupsTheCodeForReadingAloud() {
        assertThat(PairingService.forDisplay("WXYZ4821")).isEqualTo("WXYZ-4821");
        assertThat(PairingService.forDisplay(null)).isNull();
        assertThat(PairingService.forDisplay("SHORT")).isEqualTo("SHORT");
    }

    private static PairingRequest pending(String userCode) {
        PairingRequest row = new PairingRequest();
        row.setUserCode(userCode);
        row.setDeviceCodeHash("hash");
        row.setStatus(PairingRequest.Status.PENDING);
        row.setInstanceLabel("pdf-prod-01");
        row.setInstanceVersion("1.4.2");
        row.setRequesterIp("203.0.113.44");
        row.setExpiresAt(LocalDateTime.now().plusMinutes(10));
        return row;
    }
}
