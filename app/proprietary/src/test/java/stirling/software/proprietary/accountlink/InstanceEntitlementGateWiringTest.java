package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Verifies {@link InstanceEntitlementGate#evaluate} resolves live state from store + cache. */
class InstanceEntitlementGateWiringTest {

    private AccountLinkProperties properties;
    private DeviceCredentialStore store;
    private EntitlementCache cache;
    private InstanceEntitlementGate gate;

    @BeforeEach
    void setUp() {
        properties = new AccountLinkProperties();
        properties.setEnabled(true);
        store = mock(DeviceCredentialStore.class);
        cache = mock(EntitlementCache.class);
        gate = new InstanceEntitlementGate(properties, store, cache);
    }

    @Test
    void manualNeverConsultsStoreOrCache() {
        GateDecision d = gate.evaluate(false);
        assertTrue(d.allowed());
        assertEquals(GateDecision.Reason.MANUAL_FREE, d.reason());
        verify(store, never()).isLinked();
        verify(cache, never()).current();
    }

    @Test
    void billableUnlinkedDoesNotHitCache() {
        when(store.isLinked()).thenReturn(false);
        GateDecision d = gate.evaluate(true);
        assertFalse(d.allowed());
        assertEquals(GateDecision.Reason.NOT_LINKED, d.reason());
        verify(cache, never()).current();
    }

    @Test
    void billableLinkedConsultsCache() {
        when(store.isLinked()).thenReturn(true);
        when(cache.current())
                .thenReturn(
                        Optional.of(
                                new InstanceEntitlement(false, 5, 0, null, EntitlementState.OK)));
        GateDecision d = gate.evaluate(true);
        assertTrue(d.allowed());
        assertEquals(GateDecision.Reason.ENTITLED, d.reason());
    }

    @Test
    void flagOffShortCircuits() {
        properties.setEnabled(false);
        GateDecision d = gate.evaluate(true);
        assertTrue(d.allowed());
        assertEquals(GateDecision.Reason.FLAG_OFF, d.reason());
        verify(store, never()).isLinked();
    }
}
