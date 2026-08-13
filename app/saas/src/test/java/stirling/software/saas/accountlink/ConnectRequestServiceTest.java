package stirling.software.saas.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.saas.accountlink.ConnectRequestService.ClaimOutcome;
import stirling.software.saas.accountlink.ConnectRequestService.CreateRejection;

/**
 * Unit tests for the connect handshake's security properties, which are the reason this flow is
 * safe rather than an open redirect: the callback is validated once and then read back from
 * storage, the claim secret authenticates the collection, and one approval mints exactly one
 * credential.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConnectRequestServiceTest {

    private static final String CALLBACK = "https://pdf.example.com/account-link/callback";
    private static final String NONCE = "nonce-value";
    private static final String CLAIM_SECRET = "claim-secret-value";

    @Mock private ConnectRequestRepository repo;
    @Mock private AccountLinkService accountLinkService;

    private ConnectRequestService service;

    @BeforeEach
    void setUp() {
        service = new ConnectRequestService(repo, accountLinkService);
    }

    // ---------------------------------------------------------------------------------------
    // Creation
    // ---------------------------------------------------------------------------------------

    @Test
    void create_storesTheValidatedCallbackAndItsOrigin() {
        ConnectRequestService.CreateResult result =
                service.create("prod-1", CALLBACK, NONCE, CLAIM_SECRET, "10.0.0.1");

        assertThat(result.isRejected()).isFalse();
        assertThat(result.requestId()).isNotBlank();

        ArgumentCaptor<ConnectRequest> saved = ArgumentCaptor.forClass(ConnectRequest.class);
        verify(repo).save(saved.capture());
        ConnectRequest row = saved.getValue();
        assertThat(row.getCallbackUrl()).isEqualTo(CALLBACK);
        assertThat(row.getCallbackOrigin()).isEqualTo("https://pdf.example.com");
        assertThat(row.getStatus()).isEqualTo(ConnectRequest.Status.PENDING);
        assertThat(row.getName()).isEqualTo("prod-1");
        // The claim secret is only ever stored as a hash.
        assertThat(row.getClaimSecretHash()).isNotEqualTo(CLAIM_SECRET).hasSize(64);
    }

    @Test
    void create_keepsANonDefaultPortInTheOrigin() {
        service.create(
                null, "http://pdf.internal:8080/account-link/callback", NONCE, CLAIM_SECRET, null);

        ArgumentCaptor<ConnectRequest> saved = ArgumentCaptor.forClass(ConnectRequest.class);
        verify(repo).save(saved.capture());
        assertThat(saved.getValue().getCallbackOrigin()).isEqualTo("http://pdf.internal:8080");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "/account-link/callback", // not absolute
                "ftp://pdf.example.com/cb", // wrong scheme
                "javascript:alert(1)", // not a hierarchical http(s) URL
                "https://user:pw@pdf.example.com/cb", // credentials in the URL
                "https://pdf.example.com/cb#already", // would collide with our fragment
                "https:///cb" // no host
            })
    void create_refusesCallbacksWeWouldNotWantToRedirectTo(String callback) {
        ConnectRequestService.CreateResult result =
                service.create(null, callback, NONCE, CLAIM_SECRET, null);

        assertThat(result.rejection()).isEqualTo(CreateRejection.BAD_CALLBACK);
        verify(repo, never()).save(any());
    }

    @Test
    void create_refusesAMissingNonce() {
        assertThat(service.create(null, CALLBACK, "  ", CLAIM_SECRET, null).rejection())
                .isEqualTo(CreateRejection.BAD_NONCE);
        verify(repo, never()).save(any());
    }

    @Test
    void create_isCappedPerSourceAddress() {
        when(repo.countByRequesterIpAndCreatedAtAfter(anyString(), any()))
                .thenReturn((long) ConnectRequestService.MAX_REQUESTS_PER_IP);

        ConnectRequestService.CreateResult result =
                service.create(null, CALLBACK, NONCE, CLAIM_SECRET, "10.0.0.1");

        assertThat(result.rejection()).isEqualTo(CreateRejection.RATE_LIMITED);
        verify(repo, never()).save(any());
    }

    // ---------------------------------------------------------------------------------------
    // Lookup
    // ---------------------------------------------------------------------------------------

    @Test
    void lookup_flagsPlaintextTransportSoTheApproverCanSeeIt() {
        ConnectRequest row = pending();
        row.setCallbackOrigin("http://pdf.internal:8080");
        when(repo.findByRequestId("req")).thenReturn(Optional.of(row));

        assertThat(service.lookup("req")).get().extracting("insecureTransport").isEqualTo(true);
    }

    @Test
    void lookup_hidesAnExpiredHandshake() {
        ConnectRequest row = pending();
        row.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        when(repo.findByRequestId("req")).thenReturn(Optional.of(row));

        assertThat(service.lookup("req")).isEmpty();
    }

    // ---------------------------------------------------------------------------------------
    // Approval
    // ---------------------------------------------------------------------------------------

    @Test
    void approve_bindsTheTeamAndReturnsTheStoredCallback() {
        ConnectRequest row = pending();
        when(repo.findByRequestIdForUpdate("req")).thenReturn(Optional.of(row));

        Optional<ConnectRequestService.ApprovalTarget> target = service.approve("req", 7L, 42L);

        assertThat(target).isPresent();
        // The destination comes from the row, never from the caller.
        assertThat(target.get().callbackUrl()).isEqualTo(CALLBACK);
        assertThat(target.get().nonce()).isEqualTo(NONCE);
        assertThat(row.getStatus()).isEqualTo(ConnectRequest.Status.APPROVED);
        assertThat(row.getTeamId()).isEqualTo(7L);
        assertThat(row.getApprovedByUserId()).isEqualTo(42L);
        // Approval on its own must not mint anything.
        verifyNoInteractions(accountLinkService);
    }

    @Test
    void approve_isSingleUse() {
        ConnectRequest row = pending();
        row.setStatus(ConnectRequest.Status.APPROVED);
        when(repo.findByRequestIdForUpdate("req")).thenReturn(Optional.of(row));

        assertThat(service.approve("req", 7L, 42L)).isEmpty();
    }

    @Test
    void approve_refusesAnExpiredHandshake() {
        ConnectRequest row = pending();
        row.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        when(repo.findByRequestIdForUpdate("req")).thenReturn(Optional.of(row));

        assertThat(service.approve("req", 7L, 42L)).isEmpty();
    }

    // ---------------------------------------------------------------------------------------
    // Claim
    // ---------------------------------------------------------------------------------------

    @Test
    void claim_mintsOnceForAnApprovedHandshake() {
        ConnectRequest row = approved();
        when(repo.findByRequestIdForUpdate("req")).thenReturn(Optional.of(row));
        when(accountLinkService.register(anyLong(), anyLong(), any()))
                .thenReturn(
                        new AccountLinkService.RegisteredInstance(9L, "dev-id", "dev-secret", "n"));

        ConnectRequestService.ClaimResult result = service.claim("req", CLAIM_SECRET);

        assertThat(result.outcome()).isEqualTo(ClaimOutcome.GRANTED);
        assertThat(result.deviceId()).isEqualTo("dev-id");
        assertThat(result.deviceSecret()).isEqualTo("dev-secret");
        assertThat(result.teamId()).isEqualTo(7L);
        assertThat(row.getStatus()).isEqualTo(ConnectRequest.Status.CONSUMED);
        verify(accountLinkService).register(7L, 42L, "n");
    }

    @Test
    void claim_refusesASecondCollection() {
        ConnectRequest row = approved();
        row.setStatus(ConnectRequest.Status.CONSUMED);
        when(repo.findByRequestIdForUpdate("req")).thenReturn(Optional.of(row));

        assertThat(service.claim("req", CLAIM_SECRET).outcome()).isEqualTo(ClaimOutcome.REJECTED);
        verifyNoInteractions(accountLinkService);
    }

    @Test
    void claim_withTheWrongSecretMintsNothing() {
        ConnectRequest row = approved();
        when(repo.findByRequestIdForUpdate("req")).thenReturn(Optional.of(row));

        assertThat(service.claim("req", "not-the-secret").outcome())
                .isEqualTo(ClaimOutcome.REJECTED);
        assertThat(row.getStatus()).isEqualTo(ConnectRequest.Status.APPROVED);
        verifyNoInteractions(accountLinkService);
    }

    @Test
    void claim_beforeApprovalTellsTheInstanceToWait() {
        when(repo.findByRequestIdForUpdate("req")).thenReturn(Optional.of(pending()));

        assertThat(service.claim("req", CLAIM_SECRET).outcome()).isEqualTo(ClaimOutcome.PENDING);
        verifyNoInteractions(accountLinkService);
    }

    @Test
    void claim_afterDenialIsTerminal() {
        ConnectRequest row = pending();
        row.setStatus(ConnectRequest.Status.DENIED);
        when(repo.findByRequestIdForUpdate("req")).thenReturn(Optional.of(row));

        assertThat(service.claim("req", CLAIM_SECRET).outcome()).isEqualTo(ClaimOutcome.REJECTED);
        verifyNoInteractions(accountLinkService);
    }

    @Test
    void claim_onAnExpiredHandshakeMintsNothing() {
        ConnectRequest row = approved();
        row.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        when(repo.findByRequestIdForUpdate("req")).thenReturn(Optional.of(row));

        assertThat(service.claim("req", CLAIM_SECRET).outcome()).isEqualTo(ClaimOutcome.REJECTED);
        verifyNoInteractions(accountLinkService);
    }

    @Test
    void claim_forAnUnknownIdLooksTheSameAsABadSecret() {
        when(repo.findByRequestIdForUpdate("nope")).thenReturn(Optional.empty());

        assertThat(service.claim("nope", CLAIM_SECRET).outcome()).isEqualTo(ClaimOutcome.REJECTED);
    }

    // ---------------------------------------------------------------------------------------

    private static ConnectRequest pending() {
        ConnectRequest row = new ConnectRequest();
        row.setRequestId("req");
        row.setName("n");
        row.setCallbackUrl(CALLBACK);
        row.setCallbackOrigin("https://pdf.example.com");
        row.setNonce(NONCE);
        row.setClaimSecretHash(AccountLinkService.sha256Hex(CLAIM_SECRET));
        row.setStatus(ConnectRequest.Status.PENDING);
        row.setExpiresAt(LocalDateTime.now().plusMinutes(10));
        return row;
    }

    private static ConnectRequest approved() {
        ConnectRequest row = pending();
        row.setStatus(ConnectRequest.Status.APPROVED);
        row.setTeamId(7L);
        row.setApprovedByUserId(42L);
        row.setApprovedAt(LocalDateTime.now());
        return row;
    }
}
