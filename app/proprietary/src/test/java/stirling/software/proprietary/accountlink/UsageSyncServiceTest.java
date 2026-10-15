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
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;

@ExtendWith(MockitoExtension.class)
class UsageSyncServiceTest {

    @Mock private UsageCounterRepository counters;
    @Mock private AccountLinkSyncStateRepository syncState;
    @Mock private DeviceCredentialStore credentialStore;
    @Mock private AccountLinkClient client;
    @Mock private EntitlementCache entitlementCache;

    @Mock private ApplicationEventPublisher events;

    @Mock
    private org.springframework.beans.factory.ObjectProvider<
                    stirling.software.proprietary.security.service.UserService>
            users;

    @Mock private stirling.software.proprietary.security.service.UserService localUsers;
    @Mock private stirling.software.proprietary.service.UserLicenseSettingsService licenseSettings;
    private final AccountLinkProperties properties = new AccountLinkProperties();

    private UsageSyncService service;
    private final LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);

    @BeforeEach
    void setUp() {
        properties.getMetering().setEnabled(true);
        org.mockito.Mockito.lenient().when(users.getIfAvailable()).thenReturn(localUsers);
        org.mockito.Mockito.lenient().when(localUsers.getTotalUsersCount()).thenReturn(7L);
        service =
                new UsageSyncService(
                        counters,
                        syncState,
                        credentialStore,
                        client,
                        entitlementCache,
                        properties,
                        events,
                        users,
                        licenseSettings);
    }

    @Test
    void registersFixedDelayTaskWithConfiguredInterval() {
        AccountLinkProperties props = new AccountLinkProperties();
        props.getMetering().setSyncIntervalHours(6);
        UsageSyncService svc =
                new UsageSyncService(
                        counters,
                        syncState,
                        credentialStore,
                        client,
                        entitlementCache,
                        props,
                        events,
                        users,
                        licenseSettings);

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
    void requestSyncRunsTheFirstAsk() {
        when(credentialStore.get()).thenReturn(Optional.empty());

        UsageSyncService.SyncRequest result = service.requestSync(false);

        assertThat(result.ran()).isTrue();
        assertThat(result.retryAfterSeconds()).isZero();
    }

    @Test
    void requestSyncDeclinesASecondAskInsideTheWindow() {
        when(credentialStore.get()).thenReturn(Optional.empty());
        service.requestSync(false);

        UsageSyncService.SyncRequest result = service.requestSync(false);

        // The reloaded page: asking is fine, reporting again is what the throttle refuses.
        assertThat(result.ran()).isFalse();
        assertThat(result.retryAfterSeconds()).isBetween(1L, 60L);
        verify(credentialStore, times(1)).get();
    }

    @Test
    void requestSyncThrottlesOnTheAttemptRatherThanTheOutcome() {
        // An instance that cannot reach SaaS is exactly the one a reload must not retry freely.
        when(credentialStore.get()).thenReturn(Optional.of(credential()));
        when(counters.findPeriodsWithUnsyncedUsage()).thenReturn(List.of(period));
        when(counters.findByPeriodStart(period)).thenReturn(List.of());
        when(syncState.findById(any())).thenReturn(Optional.empty());
        when(client.reportUsage(
                        any(),
                        any(),
                        anyLong(),
                        any(),
                        anyLong(),
                        anyLong(),
                        anyLong(),
                        org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn(null);

        assertThat(service.requestSync(false).ran()).isTrue();

        assertThat(service.requestSync(false).ran()).isFalse();
    }

    @Test
    void forceRunsRegardlessOfTheWindow() {
        when(credentialStore.get()).thenReturn(Optional.empty());
        service.requestSync(false);

        UsageSyncService.SyncRequest result = service.requestSync(true);

        assertThat(result.ran()).isTrue();
        verify(credentialStore, times(2)).get();
    }

    @Test
    void aZeroWindowDisablesTheThrottle() {
        properties.getMetering().setManualSyncThrottle(Duration.ZERO);
        when(credentialStore.get()).thenReturn(Optional.empty());
        service.requestSync(false);

        assertThat(service.requestSync(false).ran()).isTrue();
    }

    @Test
    void theScheduledSyncAlsoOpensTheWindow() {
        when(credentialStore.get()).thenReturn(Optional.empty());
        service.scheduledSync();

        // Otherwise a page opened just after the daily run would report all over again.
        assertThat(service.requestSync(false).ran()).isFalse();
    }

    @Test
    void notLinkedSkipsEntirely() {
        when(credentialStore.get()).thenReturn(Optional.empty());

        service.syncNow();

        verifyNoInteractions(client, entitlementCache, events);
        verify(counters, never()).findPeriodsWithUnsyncedUsage();
    }

    @Test
    void nothingPendingStillReportsSeatsAndRefreshesEntitlement() {
        when(credentialStore.get()).thenReturn(Optional.of(credential()));
        when(counters.findPeriodsWithUnsyncedUsage()).thenReturn(List.of());
        var fresh = entitled();
        when(client.reportUsage("dev-1", "sec-1", 0, null, 0, 0, 0, 7)).thenReturn(fresh);
        service.syncNow();
        verify(entitlementCache).accept("dev-1", fresh);
        verify(events).publishEvent(any(EntitlementRefreshedEvent.class));
        verifyNoInteractions(syncState);
    }

    @Test
    void meteringDisabledStillReportsSeats() {
        properties.getMetering().setEnabled(false);
        when(credentialStore.get()).thenReturn(Optional.of(credential()));
        service.syncNow();
        verify(client).reportUsage("dev-1", "sec-1", 0, null, 0, 0, 0, 7);
        verifyNoInteractions(counters);
    }

    @Test
    void installedPaidLicenseDoesNotConsumeTeamSeats() {
        properties.getMetering().setEnabled(false);
        when(credentialStore.get()).thenReturn(Optional.of(credential()));
        when(licenseSettings.hasLicenseKeyPaidTier()).thenReturn(true);
        service.syncNow();
        verify(client).reportUsage("dev-1", "sec-1", 0, null, 0, 0, 0, 0);
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
                        eq("dev-1"),
                        eq("sec-1"),
                        eq(6L),
                        eq(period),
                        eq(12L),
                        eq(4L),
                        eq(0L),
                        eq(7)))
                .thenReturn(fresh);

        service.syncNow();

        // Seq advanced from 5 → 6 and the report carried the per-category cumulative.
        verify(client)
                .reportUsage(
                        eq("dev-1"),
                        eq("sec-1"),
                        eq(6L),
                        eq(period),
                        eq(12L),
                        eq(4L),
                        eq(0L),
                        eq(7));
        // Only categories with usage are marked; AUTOMATION (0) is skipped.
        verify(counters).markSynced(period, "API", 12L);
        verify(counters).markSynced(period, "AI", 4L);
        verify(counters, never()).markSynced(eq(period), eq("AUTOMATION"), anyLong());
        // Two saves: the pre-report seq reservation + the post-success timestamp.
        verify(syncState, times(2)).save(state);
        verify(entitlementCache).accept("dev-1", fresh);
        verify(events).publishEvent(any(EntitlementRefreshedEvent.class));
    }

    @Test
    void transportFailureReservesSeqButLeavesMarkersUntouched() {
        AccountLinkSyncState state = new AccountLinkSyncState();
        state.setId(AccountLinkSyncState.SINGLETON_ID);
        when(credentialStore.get()).thenReturn(Optional.of(credential()));
        when(counters.findPeriodsWithUnsyncedUsage()).thenReturn(List.of(period));
        when(counters.findByPeriodStart(period)).thenReturn(List.of(counter(period, "API", 12L)));
        when(syncState.findById(AccountLinkSyncState.SINGLETON_ID)).thenReturn(Optional.of(state));
        when(client.reportUsage(
                        any(), any(), anyLong(), any(), anyLong(), anyLong(), anyLong(), eq(7)))
                .thenReturn(null);

        service.syncNow();

        verify(counters, never()).markSynced(any(), any(), anyLong());
        verify(syncState, times(1)).save(state); // seq reserved, success not recorded
        verify(entitlementCache).accept("dev-1", null); // nothing fresh adopted
        // accept() no-ops on null, so saying the entitlement was refreshed would be a lie: the
        // licence tier listens to this and would re-read a plan nobody fetched.
        verify(events, never()).publishEvent(any(EntitlementRefreshedEvent.class));
    }

    @Test
    void revokedAbortsAndBlocksImmediately() {
        AccountLinkSyncState state = new AccountLinkSyncState();
        state.setId(AccountLinkSyncState.SINGLETON_ID);
        when(credentialStore.get()).thenReturn(Optional.of(credential()));
        when(counters.findPeriodsWithUnsyncedUsage()).thenReturn(List.of(period));
        when(counters.findByPeriodStart(period)).thenReturn(List.of(counter(period, "API", 12L)));
        when(syncState.findById(AccountLinkSyncState.SINGLETON_ID)).thenReturn(Optional.of(state));
        when(client.reportUsage(
                        any(), any(), anyLong(), any(), anyLong(), anyLong(), anyLong(), eq(7)))
                .thenThrow(new AccountLinkClient.RevokedException(403));

        service.syncNow();

        verify(counters, never()).markSynced(any(), any(), anyLong());
        verify(entitlementCache)
                .accept(
                        eq("dev-1"),
                        org.mockito.ArgumentMatchers.argThat(
                                value -> value.state() == EntitlementState.REVOKED));
        verify(events).publishEvent(any(EntitlementRefreshedEvent.class));
    }
}
