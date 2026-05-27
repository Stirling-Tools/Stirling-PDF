package stirling.software.saas.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;

import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.core.SimpleLock;

import stirling.software.saas.config.CreditsProperties;

/**
 * Pins the cluster-aware behaviour of {@link CreditResetScheduler}.
 *
 * <p>Two pods booting simultaneously must not both run the catch-up reset — that would double the
 * load on the DB at the worst possible moment (startup) and (once PAYG ledger lands) write
 * duplicate {@code CYCLE_GRANT} entries. The {@code @SchedulerLock} annotation covers the cron path
 * automatically; the {@code @EventListener} catch-up doesn't get AOP advice from ShedLock so it
 * acquires the lock programmatically. This test pins that contract.
 */
class CreditResetSchedulerShedLockTest {

    @Test
    void catchUpReset_doesNothing_whenLockIsHeldByAnotherInstance() {
        CreditService creditService = mock(CreditService.class);
        CreditsProperties creditsProperties = stubCreditsProperties();
        LockProvider lockProvider = mock(LockProvider.class);

        // Lock unavailable — another pod holds it. ShedLock returns Optional.empty() in that case.
        when(lockProvider.lock(any(LockConfiguration.class))).thenReturn(Optional.empty());

        CreditResetScheduler scheduler =
                new CreditResetScheduler(creditService, creditsProperties, lockProvider);

        scheduler.onApplicationReady();

        verify(creditService, never()).resetCycleCreditsForAllUsers(any());
        verify(creditService, never()).resetCycleCreditsForAllTeams(any());
    }

    @Test
    void catchUpReset_runsAndReleasesLock_whenLockIsAvailable() {
        CreditService creditService = mock(CreditService.class);
        CreditsProperties creditsProperties = stubCreditsProperties();
        LockProvider lockProvider = mock(LockProvider.class);
        SimpleLock acquiredLock = mock(SimpleLock.class);

        when(lockProvider.lock(any(LockConfiguration.class))).thenReturn(Optional.of(acquiredLock));

        CreditResetScheduler scheduler =
                new CreditResetScheduler(creditService, creditsProperties, lockProvider);

        scheduler.onApplicationReady();

        // Reset work fired.
        verify(creditService).resetCycleCreditsForAllUsers(any());
        verify(creditService).resetCycleCreditsForAllTeams(any());
        // Lock released — without this, the next instance would wait pointlessly on a stale lock
        // until lockAtMostFor elapsed.
        verify(acquiredLock).unlock();
    }

    @Test
    void catchUpReset_releasesLock_evenWhenResetThrows() {
        CreditService creditService = mock(CreditService.class);
        CreditsProperties creditsProperties = stubCreditsProperties();
        LockProvider lockProvider = mock(LockProvider.class);
        SimpleLock acquiredLock = mock(SimpleLock.class);

        when(lockProvider.lock(any(LockConfiguration.class))).thenReturn(Optional.of(acquiredLock));
        // Simulate a transient DB issue mid-reset.
        org.mockito.Mockito.doThrow(new RuntimeException("simulated DB failure"))
                .when(creditService)
                .resetCycleCreditsForAllUsers(any());

        CreditResetScheduler scheduler =
                new CreditResetScheduler(creditService, creditsProperties, lockProvider);

        // onApplicationReady catches Exception and logs — does not propagate. The lock release
        // is what matters for cluster behaviour.
        scheduler.onApplicationReady();

        verify(acquiredLock).unlock();
    }

    private static CreditsProperties stubCreditsProperties() {
        CreditsProperties props = mock(CreditsProperties.class);
        CreditsProperties.Reset reset = mock(CreditsProperties.Reset.class);
        when(props.getReset()).thenReturn(reset);
        when(reset.getZone()).thenReturn("UTC");
        when(reset.getCron()).thenReturn("0 0 2 1 * *");
        return props;
    }
}
