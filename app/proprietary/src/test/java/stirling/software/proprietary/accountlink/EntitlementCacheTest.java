package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class EntitlementCacheTest {

    private DeviceCredentialStore store;
    private AccountLinkClient client;
    private AccountLinkProperties properties;
    private EntitlementCache cache;

    @BeforeEach
    void setUp() {
        store = mock(DeviceCredentialStore.class);
        client = mock(AccountLinkClient.class);
        properties = new AccountLinkProperties();
        properties.setEntitlementCacheSeconds(300);
        cache = new EntitlementCache(store, client, properties);
    }

    private DeviceCredential cred() {
        DeviceCredential c = new DeviceCredential();
        c.setDeviceId("dev-1");
        c.setDeviceSecret("sec-1");
        c.setTeamId(1L);
        c.setLinkedAt(LocalDateTime.now());
        return c;
    }

    @Test
    void unlinked_returnsEmpty() {
        when(store.get()).thenReturn(Optional.empty());
        assertTrue(cache.current().isEmpty());
    }

    @Test
    void linked_fetchesAndCachesWithinTtl() {
        InstanceEntitlement snap = new InstanceEntitlement(false, 10, 0, null, EntitlementState.OK);
        when(store.get()).thenReturn(Optional.of(cred()));
        when(client.fetchEntitlement(anyString(), anyString())).thenReturn(snap);

        assertEquals(snap, cache.current().orElseThrow());
        // Second read within TTL must not re-fetch.
        assertEquals(snap, cache.current().orElseThrow());
        verify(client, times(1)).fetchEntitlement(any(), any());
    }

    @Test
    void linked_unreachable_keepsLastKnownSnapshot_failOpenFriendly() {
        InstanceEntitlement snap = new InstanceEntitlement(true, 0, 1, 100L, EntitlementState.OK);
        when(store.get()).thenReturn(Optional.of(cred()));
        when(client.fetchEntitlement(anyString(), anyString())).thenReturn(snap);
        assertEquals(snap, cache.current().orElseThrow());

        // TTL elapsed → refresh attempted, but the SaaS side is now unreachable (null).
        cache.invalidate();
        when(client.fetchEntitlement(anyString(), anyString())).thenReturn(null);
        assertEquals(snap, cache.current().orElseThrow(), "stale snapshot retained on failure");
    }

    @Test
    void linked_neverFetched_unreachable_backsOffWithinTtl() {
        // No prior snapshot + SaaS unreachable: the gate fails open (empty), but a failed
        // attempt stamps the TTL so a second read within the window does NOT re-fetch —
        // no sustained hammer of blocking round-trips against a dead endpoint.
        when(store.get()).thenReturn(Optional.of(cred()));
        when(client.fetchEntitlement(anyString(), anyString())).thenReturn(null);

        assertTrue(cache.current().isEmpty());
        assertTrue(cache.current().isEmpty());
        verify(client, times(1)).fetchEntitlement(any(), any());
    }

    @Test
    void linked_revoked_blocksAndDropsStaleEntitlement() {
        InstanceEntitlement entitled =
                new InstanceEntitlement(true, 0, 1, 100L, EntitlementState.OK);
        when(store.get()).thenReturn(Optional.of(cred()));
        when(client.fetchEntitlement(anyString(), anyString())).thenReturn(entitled);
        assertEquals(entitled, cache.current().orElseThrow());

        // Credential revoked: the next refresh is an authoritative deny. The cache must NOT keep
        // serving the stale entitled snapshot — it replaces it with a blocked REVOKED one.
        cache.invalidate();
        when(client.fetchEntitlement(anyString(), anyString()))
                .thenThrow(new AccountLinkClient.RevokedException(401));
        assertEquals(EntitlementState.REVOKED, cache.current().orElseThrow().state());
    }

    @Test
    void invalidate_forcesRefetch() {
        InstanceEntitlement snap = new InstanceEntitlement(false, 10, 0, null, EntitlementState.OK);
        when(store.get()).thenReturn(Optional.of(cred()));
        when(client.fetchEntitlement(anyString(), anyString())).thenReturn(snap);

        cache.current();
        cache.invalidate();
        cache.current();
        verify(client, times(2)).fetchEntitlement(any(), any());
    }
}
