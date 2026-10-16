package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.cluster.DistributedLock;
import stirling.software.proprietary.accountlink.AccountLinkClient.ConnectClaimOutcome;
import stirling.software.proprietary.accountlink.AccountLinkClient.ConnectClaimResult;
import stirling.software.proprietary.accountlink.LinkKeyRedeemService.Outcome;
import stirling.software.proprietary.service.OrgOwnerService;

class LinkKeyRedeemServiceTest {

    private final String key = LinkKeyFormat.generate(new SecureRandom()).compose();

    private AccountLinkClient client;
    private DeviceCredentialStore store;
    private EntitlementCache cache;
    private OrgOwnerService owners;
    private DistributedLock locks;
    private DistributedLock.LockHandle handle;
    private LinkKeyRedeemService service;

    @BeforeEach
    void setUp() {
        client = mock(AccountLinkClient.class);
        store = mock(DeviceCredentialStore.class);
        cache = mock(EntitlementCache.class);
        owners = mock(OrgOwnerService.class);
        locks = mock(DistributedLock.class);
        handle = mock(DistributedLock.LockHandle.class);
        when(locks.tryAcquire(anyString(), any(Duration.class))).thenReturn(Optional.of(handle));
        service =
                new LinkKeyRedeemService(
                        client,
                        store,
                        cache,
                        owners,
                        locks,
                        mock(PlatformTransactionManager.class));
    }

    @Test
    void aGrantedKeyIsStoredAsAKeyLinkAndClearsTheCachedEntitlement() {
        when(client.redeemKey(key, "pdf.acme"))
                .thenReturn(new ConnectClaimResult(ConnectClaimOutcome.GRANTED, "dev", "sec", 7L));

        LinkKeyRedeemService.Result result = service.redeemFromConfiguration(key, "pdf.acme");

        assertThat(result.outcome()).isEqualTo(Outcome.LINKED);
        assertThat(result.teamId()).isEqualTo(7L);
        verify(store).save("dev", "sec", 7L, LinkMethod.KEY);
        verify(cache).invalidate();
        verify(handle).close();
    }

    @Test
    void aCredentialThatCannotBeStoredIsRevokedSoNoInstanceIsStranded() {
        when(client.redeemKey(key, null))
                .thenReturn(new ConnectClaimResult(ConnectClaimOutcome.GRANTED, "dev", "sec", 7L));
        org.mockito.Mockito.doThrow(new IllegalStateException("database down"))
                .when(store)
                .save("dev", "sec", 7L, LinkMethod.KEY);

        assertThatThrownBy(() -> service.redeemFromConfiguration(key, null))
                .isInstanceOf(IllegalStateException.class);
        verify(client).revokeSelf("dev", "sec");
        verify(cache, never()).invalidate();
        verify(handle).close();
    }

    @Test
    void aLinkMadeWhileSaasAnsweredWinsAndTheNewCredentialIsRevoked() {
        when(store.isLinked()).thenReturn(false, true);
        when(client.redeemKey(key, null))
                .thenReturn(new ConnectClaimResult(ConnectClaimOutcome.GRANTED, "dev", "sec", 7L));

        assertThat(service.redeemFromConfiguration(key, null).outcome())
                .isEqualTo(Outcome.ALREADY_LINKED);
        verify(store, never()).save(any(), any(), any(), any());
        verify(client).revokeSelf("dev", "sec");
    }

    @Test
    void theOwnerPathChecksOwnershipBeforeSpendingTheKey() {
        Authentication auth = mock(Authentication.class);
        when(owners.requireCurrentOwner(auth))
                .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "orgOwnerRequired"));

        assertThatThrownBy(() -> service.redeemAsOwner(key, null, auth))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(client);
        verify(handle).close();
    }

    @Test
    void anAlreadyLinkedServerNeverSpendsTheKey() {
        when(store.isLinked()).thenReturn(true);

        assertThat(service.redeemFromConfiguration(key, null).outcome())
                .isEqualTo(Outcome.ALREADY_LINKED);
        verifyNoInteractions(client);
    }

    @Test
    void somethingThatIsNotAKeyIsNeverSent() {
        assertThat(service.redeemFromConfiguration("1f3c2a9e-license", null).outcome())
                .isEqualTo(Outcome.BAD_FORMAT);
        verifyNoInteractions(client, locks);
    }

    @Test
    void aRefusedKeyStoresNothing() {
        when(client.redeemKey(key, null))
                .thenReturn(new ConnectClaimResult(ConnectClaimOutcome.REJECTED, null, null, null));

        assertThat(service.redeemFromConfiguration(key, null).outcome())
                .isEqualTo(Outcome.REJECTED);
        verify(store, never()).save(any(), any(), any(), any());
        verify(cache, never()).invalidate();
    }

    @Test
    void anUnreachableCloudLeavesTheKeyForARetry() {
        when(client.redeemKey(key, null))
                .thenReturn(
                        new ConnectClaimResult(ConnectClaimOutcome.UNAVAILABLE, null, null, null));

        assertThat(service.redeemFromConfiguration(key, null).outcome())
                .isEqualTo(Outcome.UNAVAILABLE);
        verify(store, never()).save(any(), any(), any(), any());
    }

    @Test
    void anotherNodeRedeemingMeansBusy() {
        when(locks.tryAcquire(anyString(), any(Duration.class))).thenReturn(Optional.empty());

        assertThat(service.redeemFromConfiguration(key, null).outcome()).isEqualTo(Outcome.BUSY);
        verifyNoInteractions(client);
    }

    @Test
    void aBrokenLockBackendIsReportedAsUnavailable() {
        when(locks.tryAcquire(anyString(), any(Duration.class)))
                .thenThrow(new IllegalStateException("valkey down"));

        assertThat(service.redeemFromConfiguration(key, null).outcome())
                .isEqualTo(Outcome.UNAVAILABLE);
        verifyNoInteractions(client);
    }
}
