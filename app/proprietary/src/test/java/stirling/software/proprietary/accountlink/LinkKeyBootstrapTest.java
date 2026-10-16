package stirling.software.proprietary.accountlink;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import stirling.software.proprietary.accountlink.LinkKeyRedeemService.Outcome;
import stirling.software.proprietary.accountlink.LinkKeyRedeemService.Result;

class LinkKeyBootstrapTest {

    private final String key = LinkKeyFormat.generate(new SecureRandom()).compose();

    private AccountLinkProperties properties;
    private LinkKeyRedeemService redeemer;
    private DeviceCredentialStore store;
    private UsageSyncService sync;
    private ScheduledExecutorService scheduler;
    private LinkKeyBootstrap bootstrap;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        properties = new AccountLinkProperties();
        properties.setKey(key);
        properties.setName("pdf.acme");
        redeemer = mock(LinkKeyRedeemService.class);
        store = mock(DeviceCredentialStore.class);
        sync = mock(UsageSyncService.class);
        ObjectProvider<UsageSyncService> syncProvider = mock(ObjectProvider.class);
        when(syncProvider.getIfAvailable()).thenReturn(sync);
        scheduler = mock(ScheduledExecutorService.class);
        bootstrap = new LinkKeyBootstrap(properties, redeemer, store, syncProvider, scheduler);
    }

    @Test
    void noConfiguredKeyDoesNothing() {
        properties.setKey("  ");

        bootstrap.onReady();

        verifyNoInteractions(scheduler, redeemer);
    }

    @Test
    void startupHandsTheWorkOffTheStartupThread() {
        bootstrap.onReady();

        verify(scheduler).execute(any(Runnable.class));
        verifyNoInteractions(redeemer);
    }

    @Test
    void aLinkedServerNeverSpendsTheConfiguredKey() {
        when(store.isLinked()).thenReturn(true);

        bootstrap.attempt(LinkKeyBootstrap.FIRST_RETRY);

        verifyNoInteractions(redeemer);
    }

    @Test
    void linkingRunsTheFirstSyncSoTheCloudSeesTheServerAtOnce() {
        when(redeemer.redeemFromConfiguration(key, "pdf.acme"))
                .thenReturn(new Result(Outcome.LINKED, 7L));

        bootstrap.attempt(LinkKeyBootstrap.FIRST_RETRY);

        verify(sync).syncNow();
        verify(scheduler, never()).schedule(any(Runnable.class), anyLong(), any(TimeUnit.class));
    }

    @Test
    void aRefusedKeyIsNotRetried() {
        when(redeemer.redeemFromConfiguration(key, "pdf.acme"))
                .thenReturn(new Result(Outcome.REJECTED, null));

        bootstrap.attempt(LinkKeyBootstrap.FIRST_RETRY);

        verify(scheduler, never()).schedule(any(Runnable.class), anyLong(), any(TimeUnit.class));
    }

    @Test
    void anUnreachableCloudIsRetriedAfterTheDelay() {
        when(redeemer.redeemFromConfiguration(key, "pdf.acme"))
                .thenReturn(new Result(Outcome.UNAVAILABLE, null));

        bootstrap.attempt(Duration.ofSeconds(30));

        verify(scheduler).schedule(any(Runnable.class), eq(30_000L), eq(TimeUnit.MILLISECONDS));
    }

    @Test
    void aBusyLockIsRetriedSoTheLosingReplicaFindsTheWinnersLink() {
        when(redeemer.redeemFromConfiguration(key, "pdf.acme"))
                .thenReturn(new Result(Outcome.BUSY, null));

        bootstrap.attempt(Duration.ofMinutes(30));

        verify(scheduler)
                .schedule(
                        any(Runnable.class),
                        eq(Duration.ofMinutes(30).toMillis()),
                        eq(TimeUnit.MILLISECONDS));
    }

    @Test
    void anUnexpectedFailureIsRetriedRatherThanLost() {
        when(redeemer.redeemFromConfiguration(key, "pdf.acme"))
                .thenThrow(new IllegalStateException("database down"));

        bootstrap.attempt(Duration.ofSeconds(30));

        verify(scheduler).schedule(any(Runnable.class), anyLong(), any(TimeUnit.class));
    }
}
