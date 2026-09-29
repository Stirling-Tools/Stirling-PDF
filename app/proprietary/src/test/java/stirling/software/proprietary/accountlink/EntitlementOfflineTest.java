package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.*;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;

class EntitlementOfflineTest {
    @Test
    void authoritativeRevocationSurvivesRestartWithoutACloudConnection() {
        Instant now = Instant.parse("2026-09-15T10:00:00Z");
        var device = new DeviceCredential();
        device.setDeviceId("device");
        device.setDeviceSecret("secret");
        device.setLinkedAt(LocalDateTime.ofInstant(now, ZoneOffset.UTC));
        var store = mock(DeviceCredentialStore.class);
        when(store.get()).thenReturn(Optional.of(device));
        doAnswer(
                        inv -> {
                            device.setLastEntitlementSuccessAt(inv.getArgument(1));
                            device.setFleetUserLimit(inv.getArgument(3));
                            device.setEntitlementRevoked(inv.getArgument(2));
                            return null;
                        })
                .when(store)
                .recordEntitlementContact(eq("device"), any(), anyBoolean(), any());
        var client = mock(AccountLinkClient.class);
        when(client.fetchEntitlement("device", "secret"))
                .thenThrow(new AccountLinkClient.RevokedException(401));
        var properties = new AccountLinkProperties();
        var clock = Clock.fixed(now, ZoneOffset.UTC);
        var cache = new EntitlementCache(store, client, properties, clock);
        assertThat(cache.current().orElseThrow().state()).isEqualTo(EntitlementState.REVOKED);
        var offlineClient = mock(AccountLinkClient.class);
        var restarted = new EntitlementCache(store, offlineClient, properties, clock);
        assertThat(restarted.current().orElseThrow().state()).isEqualTo(EntitlementState.REVOKED);
        assertThat(restarted.connectionStatus().state()).isEqualTo("revoked");
        when(offlineClient.fetchEntitlement("device", "secret"))
                .thenReturn(
                        new InstanceEntitlement(
                                true, 0, 0, null, EntitlementState.OK, null, null, null, 300));
        restarted.invalidate();
        assertThat(restarted.current().orElseThrow().state()).isEqualTo(EntitlementState.OK);
        assertThat(restarted.connectionStatus().state()).isEqualTo("connected");
    }

    @Test
    void staleCacheAndRestartCannotExtendDeadlineAndReconnectionRestoresAccess() {
        Instant start = Instant.parse("2026-09-15T10:00:00Z");
        AtomicReference<Instant> now = new AtomicReference<>(start);
        Clock clock = mock(Clock.class);
        when(clock.instant()).thenAnswer(inv -> now.get());
        when(clock.getZone()).thenReturn(ZoneOffset.UTC);
        DeviceCredential device = new DeviceCredential();
        device.setDeviceId("device");
        device.setDeviceSecret("secret");
        device.setLinkedAt(
                LocalDateTime.ofInstant(start.minus(Duration.ofDays(10)), ZoneOffset.UTC));
        DeviceCredentialStore store = mock(DeviceCredentialStore.class);
        when(store.get()).thenReturn(Optional.of(device));
        doAnswer(
                        inv -> {
                            device.setLastEntitlementSuccessAt(inv.getArgument(1));
                            device.setFleetUserLimit(inv.getArgument(3));
                            return null;
                        })
                .when(store)
                .recordEntitlementContact(eq("device"), any(), anyBoolean(), any());
        AccountLinkClient client = mock(AccountLinkClient.class);
        AccountLinkProperties properties = new AccountLinkProperties();
        InstanceEntitlement paid =
                new InstanceEntitlement(
                        true, 0, 0, null, EntitlementState.OK, null, null, null, 300);
        when(client.fetchEntitlement("device", "secret")).thenReturn(paid);
        EntitlementCache cache = new EntitlementCache(store, client, properties, clock);
        assertThat(cache.current()).contains(paid);
        now.set(start.plus(Duration.ofDays(3)).minusMillis(1));
        when(client.fetchEntitlement("device", "secret")).thenReturn(null);
        assertThat(cache.current()).contains(paid);
        assertThat(cache.isGraceExpired()).isFalse();
        now.set(start.plus(Duration.ofDays(3)));
        assertThat(cache.current()).contains(paid);
        assertThat(cache.isGraceExpired()).isTrue();
        assertThat(device.getLastEntitlementSuccessAt()).isEqualTo(start);
        EntitlementCache restarted = new EntitlementCache(store, client, properties, clock);
        assertThat(restarted.current()).isEmpty();
        assertThat(restarted.isGraceExpired()).isTrue();
        when(client.fetchEntitlement("device", "secret")).thenReturn(paid);
        restarted.invalidate();
        assertThat(restarted.current()).contains(paid);
        assertThat(restarted.isGraceExpired()).isFalse();
        assertThat(restarted.connectionStatus().state()).isEqualTo("connected");
    }

    @Test
    void aReplacementDeviceCannotUseThePreviousDevicesSuccessfulContact() {
        Instant now = Instant.parse("2026-09-15T10:00:00Z");
        DeviceCredential device = new DeviceCredential();
        device.setDeviceId("old");
        device.setDeviceSecret("secret");
        device.setLinkedAt(LocalDateTime.ofInstant(now.minus(Duration.ofDays(4)), ZoneOffset.UTC));
        DeviceCredentialStore store = mock(DeviceCredentialStore.class);
        when(store.get()).thenReturn(Optional.of(device));
        AccountLinkClient client = mock(AccountLinkClient.class);
        when(client.fetchEntitlement("old", "secret"))
                .thenReturn(
                        new InstanceEntitlement(
                                true, 0, 0, null, EntitlementState.OK, null, null, null, 300));
        EntitlementCache cache =
                new EntitlementCache(
                        store,
                        client,
                        new AccountLinkProperties(),
                        Clock.fixed(now, ZoneOffset.UTC));
        cache.current();
        device.setDeviceId("replacement");
        assertThat(cache.current()).isEmpty();
        assertThat(cache.isGraceExpired()).isTrue();
    }

    @Test
    void persistedFleetAllowanceSurvivesRestartButNotExpiryOrRevocation() {
        Instant start = Instant.parse("2026-09-15T10:00:00Z");
        Clock clock = mock(Clock.class);
        when(clock.instant()).thenReturn(start);
        var device = new DeviceCredential();
        device.setDeviceId("device");
        device.setDeviceSecret("secret");
        device.setLastEntitlementSuccessAt(start);
        device.setFleetUserLimit(17);
        var store = mock(DeviceCredentialStore.class);
        when(store.get()).thenReturn(Optional.of(device));
        var client = mock(AccountLinkClient.class);
        var cache = new EntitlementCache(store, client, new AccountLinkProperties(), clock);
        assertThat(cache.current()).isEmpty();
        assertThat(cache.fleetUserLimit()).isEqualTo(17);
        when(clock.instant()).thenReturn(start.plus(Duration.ofDays(3)));
        assertThat(cache.fleetUserLimit()).isNull();
        cache.accept(
                "device",
                new InstanceEntitlement(
                        true, 0, 0, null, EntitlementState.OK, null, null, null, 100, 10, 0L, 23));
        assertThat(cache.fleetUserLimit()).isEqualTo(23);
        cache.accept(
                "device", new InstanceEntitlement(false, 0, 0, null, EntitlementState.REVOKED));
        assertThat(cache.fleetUserLimit()).isNull();
    }
}
