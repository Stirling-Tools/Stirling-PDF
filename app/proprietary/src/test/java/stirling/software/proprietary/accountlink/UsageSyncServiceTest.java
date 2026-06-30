package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;

@ExtendWith(MockitoExtension.class)
class UsageSyncServiceTest {

    @Mock private UsageCounterRepository counters;
    @Mock private AccountLinkSyncStateRepository syncState;
    @Mock private DeviceCredentialStore credentialStore;
    @Mock private AccountLinkClient client;
    @Mock private EntitlementCache entitlementCache;

    private UsageSyncService service;
    private final LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);

    @BeforeEach
    void setUp() {
        service =
                new UsageSyncService(
                        counters,
                        syncState,
                        credentialStore,
                        client,
                        entitlementCache,
                        new AccountLinkProperties());
    }

    @Test
    void registersFixedDelayTaskWithConfiguredInterval() {
        AccountLinkProperties props = new AccountLinkProperties();
        props.getMetering().setSyncIntervalHours(6);
        UsageSyncService svc =
                new UsageSyncService(
                        counters, syncState, credentialStore, client, entitlementCache, props);

        ScheduledTaskRegistrar registrar = new ScheduledTaskRegistrar();
        svc.configureTasks(registrar);

        // Pins the interval binding in CI — the old @Scheduled SpEL only resolved at flags-on boot.
        assertThat(registrar.getFixedDelayTaskList()).hasSize(1);
        assertThat(registrar.getFixedDelayTaskList().get(0).getIntervalDuration())
                .isEqualTo(Duration.ofHours(6));
    }

    private static DeviceCredential credential() {
        DeviceCredential c = new DeviceCredential();
        c.setDeviceId("dev-1");
        c.setDeviceSecret("sec-1");
        return c;
    }

    private static UsageCounter counter(LocalDateTime period, String category, long cumulative) {
        return new UsageCounter(period, category, cumulative, LocalDateTime.now());
    }

    private static InstanceEntitlement entitled() {
        return new InstanceEntitlement(true, 0, 0, null, EntitlementState.OK);
    }

    @Test
    void notLinkedSkipsEntirely() {
        when(credentialStore.get()).thenReturn(Optional.empty());

        service.syncNow();

        verifyNoInteractions(client, entitlementCache);
        verify(counters, never()).findPeriodsWithUnsyncedUsage();
    }

    @Test
    void nothingPendingDoesNotReport() {
        when(credentialStore.get()).thenReturn(Optional.of(credential()));
        when(counters.findPeriodsWithUnsyncedUsage()).thenReturn(List.of());

        service.syncNow();

        verifyNoInteractions(client);
        verify(syncState, never()).save(any());
        verify(entitlementCache, never()).accept(any());
    }

    @Test
    void reportsCumulativePerCategoryAndAdvancesSyncedMarkers() {
        AccountLinkSyncState state = new AccountLinkSyncState();
        state.setId(AccountLinkSyncState.SINGLETON_ID);
        state.setLastSyncSeq(5L);
        when(credentialStore.get()).thenReturn(Optional.of(credential()));
        when(counters.findPeriodsWithUnsyncedUsage()).thenReturn(List.of(period));
        when(counters.findByPeriodStart(period))
                .thenReturn(List.of(counter(period, "API", 12L), counter(period, "AI", 4L)));
        when(syncState.findById(AccountLinkSyncState.SINGLETON_ID)).thenReturn(Optional.of(state));
        InstanceEntitlement fresh = entitled();
        when(client.reportUsage(
                        eq("dev-1"), eq("sec-1"), eq(6L), eq(period), eq(12L), eq(4L), eq(0L)))
                .thenReturn(fresh);

        service.syncNow();

        // Seq advanced from 5 → 6 and the report carried the per-category cumulative.
        verify(client)
                .reportUsage(eq("dev-1"), eq("sec-1"), eq(6L), eq(period), eq(12L), eq(4L), eq(0L));
        // Only categories with usage are marked; AUTOMATION (0) is skipped.
        verify(counters).markSynced(period, "API", 12L);
        verify(counters).markSynced(period, "AI", 4L);
        verify(counters, never()).markSynced(eq(period), eq("AUTOMATION"), anyLong());
        // Two saves: the pre-report seq reservation + the post-success timestamp.
        verify(syncState, times(2)).save(state);
        verify(entitlementCache).accept(fresh);
    }

    @Test
    void transportFailureReservesSeqButLeavesMarkersUntouched() {
        AccountLinkSyncState state = new AccountLinkSyncState();
        state.setId(AccountLinkSyncState.SINGLETON_ID);
        when(credentialStore.get()).thenReturn(Optional.of(credential()));
        when(counters.findPeriodsWithUnsyncedUsage()).thenReturn(List.of(period));
        when(counters.findByPeriodStart(period)).thenReturn(List.of(counter(period, "API", 12L)));
        when(syncState.findById(AccountLinkSyncState.SINGLETON_ID)).thenReturn(Optional.of(state));
        when(client.reportUsage(any(), any(), anyLong(), any(), anyLong(), anyLong(), anyLong()))
                .thenReturn(null);

        service.syncNow();

        verify(counters, never()).markSynced(any(), any(), anyLong());
        verify(syncState, times(1)).save(state); // seq reserved, success not recorded
        verify(entitlementCache).accept(null); // nothing fresh adopted
    }

    @Test
    void revokedAbortsWithoutMarkingOrAdoptingEntitlement() {
        AccountLinkSyncState state = new AccountLinkSyncState();
        state.setId(AccountLinkSyncState.SINGLETON_ID);
        when(credentialStore.get()).thenReturn(Optional.of(credential()));
        when(counters.findPeriodsWithUnsyncedUsage()).thenReturn(List.of(period));
        when(counters.findByPeriodStart(period)).thenReturn(List.of(counter(period, "API", 12L)));
        when(syncState.findById(AccountLinkSyncState.SINGLETON_ID)).thenReturn(Optional.of(state));
        when(client.reportUsage(any(), any(), anyLong(), any(), anyLong(), anyLong(), anyLong()))
                .thenThrow(new AccountLinkClient.RevokedException(403));

        service.syncNow();

        verify(counters, never()).markSynced(any(), any(), anyLong());
        verify(entitlementCache, never()).accept(any());
    }
}
