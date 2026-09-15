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

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import stirling.software.common.service.LicenseServiceInterface;
import stirling.software.proprietary.security.configuration.ee.DynamicLicenseService;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;

/** Verifies {@link InstanceEntitlementGate#evaluate} resolves live state from store + cache. */
class InstanceEntitlementGateWiringTest {

    private AccountLinkProperties properties;
    private DeviceCredentialStore store;
    private EntitlementCache cache;
    private LocalUsageService localUsage;
    private FreeTierUsageService freeTier;
    private AccountLinkSyncStateRepository syncState;
    private LicenseKeyChecker licenseChecker;
    private AnnotationConfigApplicationContext context;
    private InstanceEntitlementGate gate;

    @BeforeEach
    void setUp() {
        properties = new AccountLinkProperties();
        properties.setEnabled(true);
        store = mock(DeviceCredentialStore.class);
        cache = mock(EntitlementCache.class);
        localUsage = mock(LocalUsageService.class);
        freeTier = mock(FreeTierUsageService.class);
        syncState = mock(AccountLinkSyncStateRepository.class);
        licenseChecker = mock(LicenseKeyChecker.class);
        context = new AnnotationConfigApplicationContext();
        context.registerBean(AccountLinkProperties.class, () -> properties);
        context.registerBean(DeviceCredentialStore.class, () -> store);
        context.registerBean(EntitlementCache.class, () -> cache);
        context.registerBean(AccountLinkSyncStateRepository.class, () -> syncState);
        context.registerBean(LocalUsageService.class, () -> localUsage);
        context.registerBean(FreeTierUsageService.class, () -> freeTier);
        context.registerBean(
                LicenseServiceInterface.class, () -> new DynamicLicenseService(licenseChecker));
        context.registerBean(InstanceEntitlementGate.class);
        context.refresh();
        gate = context.getBean(InstanceEntitlementGate.class);
    }

    @AfterEach
    void tearDown() {
        context.close();
    }

    @Test
    void enterpriseBypassesExhaustedLocalCredits() {
        when(licenseChecker.premiumTier()).thenReturn(License.ENTERPRISE);
        when(freeTier.balance()).thenReturn(grant(0));

        assertEquals(
                GateDecision.allow(GateDecision.Reason.ENTERPRISE_LICENSE), gate.evaluate(true));

        verifyNoInteractions(store, cache, syncState, localUsage, freeTier);
    }

    @ParameterizedTest
    @EnumSource(EntitlementState.class)
    void enterpriseBypassesLinkedBillingRestrictions(EntitlementState state) {
        when(licenseChecker.premiumTier()).thenReturn(License.ENTERPRISE);
        when(store.isLinked()).thenReturn(true);
        when(cache.current())
                .thenReturn(Optional.of(new InstanceEntitlement(true, 0, 100, 100L, state)));
        when(localUsage.currentPeriodUnsynced())
                .thenReturn(new LocalUsageService.LocalUsage(null, 0, 0, 0, 0));

        assertEquals(
                GateDecision.allow(GateDecision.Reason.ENTERPRISE_LICENSE), gate.evaluate(true));

        verifyNoInteractions(store, cache, syncState, localUsage, freeTier);
    }

    @Test
    void enterpriseBypassesExpiredCloudSyncGrace() {
        when(licenseChecker.premiumTier()).thenReturn(License.ENTERPRISE);
        properties.getMetering().setEnabled(true);
        when(store.isLinked()).thenReturn(true);
        when(cache.current()).thenReturn(Optional.empty());
        AccountLinkSyncState stale = new AccountLinkSyncState();
        stale.setLastSuccessAt(LocalDateTime.now().minusDays(10));
        when(syncState.findById(AccountLinkSyncState.SINGLETON_ID)).thenReturn(Optional.of(stale));

        assertEquals(
                GateDecision.allow(GateDecision.Reason.ENTERPRISE_LICENSE), gate.evaluate(true));

        verifyNoInteractions(store, cache, syncState, localUsage, freeTier);
    }

    @ParameterizedTest
    @EnumSource(
            value = License.class,
            names = {"NORMAL", "SERVER"})
    void nonEnterpriseLicensesStillEnforceCredits(License license) {
        when(licenseChecker.premiumTier()).thenReturn(license);
        when(freeTier.balance()).thenReturn(grant(0));

        assertFalse(gate.evaluate(true).allowed());
    }

    @Test
    void licenseChangesTakeEffectOnTheSameGate() {
        when(licenseChecker.premiumTier())
                .thenReturn(License.NORMAL, License.ENTERPRISE, License.NORMAL);
        when(freeTier.balance()).thenReturn(grant(0));

        assertFalse(gate.evaluate(true).allowed());
        assertEquals(
                GateDecision.allow(GateDecision.Reason.ENTERPRISE_LICENSE), gate.evaluate(true));
        assertFalse(gate.evaluate(true).allowed());
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
        when(licenseChecker.premiumTier()).thenReturn(License.ENTERPRISE);
        GateDecision decision = gate.evaluate(true);
        assertTrue(decision.allowed());
        assertEquals(GateDecision.Reason.ENTERPRISE_LICENSE, decision.reason());
        verifyNoInteractions(store, cache, freeTier, localUsage);
    }

    @Test
    void removingEnterpriseLicenseRestoresCreditEnforcementWithoutRestart() {
        when(licenseChecker.premiumTier())
                .thenReturn(License.ENTERPRISE, License.NORMAL);
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
