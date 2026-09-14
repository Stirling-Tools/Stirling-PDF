package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.service.LicenseServiceInterface;

/** Verifies {@link InstanceEntitlementGate#evaluate} resolves live state from store + cache. */
class InstanceEntitlementGateWiringTest {

    private AccountLinkProperties properties;
    private DeviceCredentialStore store;
    private EntitlementCache cache;
    private LocalUsageService localUsage;
    private FreeTierUsageService freeTier;
    private InstanceEntitlementGate gate;
    private LicenseServiceInterface licenseService;

    @BeforeEach
    void setUp() {
        licenseService = mock(LicenseServiceInterface.class);
        properties = new AccountLinkProperties();
        properties.setEnabled(true);
        store = mock(DeviceCredentialStore.class);
        cache = mock(EntitlementCache.class);
        localUsage = mock(LocalUsageService.class);
        freeTier = mock(FreeTierUsageService.class);
        gate =
                new InstanceEntitlementGate(
                        properties,
                        store,
                        cache,
                        mock(AccountLinkSyncStateRepository.class),
                        localUsage,
                        freeTier,
                        licenseService);
    }

    private static FreeTierUsageService.FreeTierBalance grant(long remaining) {
        LocalDateTime start = LocalDateTime.of(2026, 9, 1, 0, 0);
        return new FreeTierUsageService.FreeTierBalance(
                500, 500 - remaining, remaining, start, start.plusMonths(1));
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
    void billableUnlinkedReadsTheLocalGrantNotTheCache() {
        when(store.isLinked()).thenReturn(false);
        when(freeTier.balance()).thenReturn(grant(10));
        GateDecision d = gate.evaluate(true);
        assertTrue(d.allowed());
        assertEquals(GateDecision.Reason.FREE_TIER, d.reason());
        verify(cache, never()).current();
    }

    @Test
    void billableLinkedConsultsCache() {
        when(store.isLinked()).thenReturn(true);
        when(cache.current())
                .thenReturn(
                        Optional.of(
                                new InstanceEntitlement(false, 5, 0, null, EntitlementState.OK)));
        // Unsubscribed → the gate reads local unsynced usage to deplete the grant in real time;
        // nothing pending here, so the 5 free units still allow the request.
        when(localUsage.currentPeriodUnsynced())
                .thenReturn(new LocalUsageService.LocalUsage(null, 0, 0, 0, 0));
        GateDecision d = gate.evaluate(true);
        assertTrue(d.allowed());
        assertEquals(GateDecision.Reason.ENTITLED, d.reason());
    }

    @Test
    void enterpriseProcessingDoesNotConsultLinkStatusOrCreditBalances() {
        when(licenseService.isRunningEE()).thenReturn(true);
        GateDecision decision = gate.evaluate(true);
        assertTrue(decision.allowed());
        assertEquals(GateDecision.Reason.ENTERPRISE_LICENSE, decision.reason());
        verifyNoInteractions(store, cache, freeTier, localUsage);
    }

    @Test
    void removingEnterpriseLicenseRestoresCreditEnforcementWithoutRestart() {
        when(licenseService.isRunningEE()).thenReturn(true, false);
        assertTrue(gate.evaluate(true).allowed());
        when(store.isLinked()).thenReturn(false);
        when(freeTier.balance()).thenReturn(grant(0));
        GateDecision decision = gate.evaluate(true);
        assertFalse(decision.allowed());
        assertEquals(GateDecision.Reason.FREE_TIER_EXHAUSTED, decision.reason());
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
