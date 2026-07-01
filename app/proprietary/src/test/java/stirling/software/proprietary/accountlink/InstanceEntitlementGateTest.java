package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.accountlink.GateDecision.Reason;

/**
 * Covers the gate decision matrix: flag-off, manual-free, unlinked, fail-open, grace-expired,
 * linked-free, and over-limit. The pure {@link InstanceEntitlementGate#decide} cases need no
 * Spring; the grace-window reference computation is exercised through {@link
 * InstanceEntitlementGate#evaluate} with mocked collaborators.
 */
@ExtendWith(MockitoExtension.class)
class InstanceEntitlementGateTest {

    @Mock private DeviceCredentialStore credentialStore;
    @Mock private EntitlementCache entitlementCache;
    @Mock private AccountLinkSyncStateRepository syncStateRepository;

    private static InstanceEntitlement free() {
        return new InstanceEntitlement(false, 100, 0, null, EntitlementState.OK);
    }

    private static InstanceEntitlement exhaustedUnsubscribed() {
        return new InstanceEntitlement(false, 0, 0, null, EntitlementState.OVER_LIMIT);
    }

    private static InstanceEntitlement subscribedWithinCap() {
        return new InstanceEntitlement(true, 0, 10, 100L, EntitlementState.OK);
    }

    private static InstanceEntitlement subscribedOverCap() {
        return new InstanceEntitlement(true, 0, 100, 100L, EntitlementState.OK);
    }

    @Test
    void flagOff_allowsEverything_evenBillableUnlinked() {
        GateDecision d =
                InstanceEntitlementGate.decide(false, true, false, Optional.empty(), false);
        assertTrue(d.allowed());
        assertEquals(Reason.FLAG_OFF, d.reason());
    }

    @Test
    void manualTool_alwaysFree_evenUnlinked() {
        GateDecision d =
                InstanceEntitlementGate.decide(true, false, false, Optional.empty(), false);
        assertTrue(d.allowed());
        assertEquals(Reason.MANUAL_FREE, d.reason());
    }

    @Test
    void billable_notLinked_blocksWithLinkSignal() {
        GateDecision d = InstanceEntitlementGate.decide(true, true, false, Optional.empty(), false);
        assertFalse(d.allowed());
        assertEquals(Reason.NOT_LINKED, d.reason());
    }

    @Test
    void billable_linked_entitlementUnreachable_withinGrace_failsOpen() {
        GateDecision d = InstanceEntitlementGate.decide(true, true, true, Optional.empty(), false);
        assertTrue(d.allowed());
        assertEquals(Reason.FAIL_OPEN, d.reason());
    }

    @Test
    void billable_linked_entitlementUnreachable_graceExpired_blocks() {
        GateDecision d = InstanceEntitlementGate.decide(true, true, true, Optional.empty(), true);
        assertFalse(d.allowed());
        assertEquals(Reason.GRACE_EXPIRED, d.reason());
    }

    @Test
    void billable_linked_freePoolAvailable_allows() {
        GateDecision d =
                InstanceEntitlementGate.decide(true, true, true, Optional.of(free()), false);
        assertTrue(d.allowed());
        assertEquals(Reason.ENTITLED, d.reason());
    }

    @Test
    void billable_linked_unsubscribedAndExhausted_blocksOverLimit() {
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(exhaustedUnsubscribed()), false);
        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }

    @Test
    void billable_linked_subscribedWithinCap_allows() {
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(subscribedWithinCap()), false);
        assertTrue(d.allowed());
        assertEquals(Reason.ENTITLED, d.reason());
    }

    @Test
    void billable_linked_subscribedOverCap_blocks() {
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(subscribedOverCap()), false);
        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }

    @Test
    void billable_linked_revoked_blocksWithRevokedSignal() {
        // Authoritative deny (revoked/invalid credential) surfaced by the cache as REVOKED —
        // blocks distinctly from over-limit, even though the snapshot is "present".
        InstanceEntitlement revoked =
                new InstanceEntitlement(false, 0, 0, null, EntitlementState.REVOKED);
        GateDecision d =
                InstanceEntitlementGate.decide(true, true, true, Optional.of(revoked), false);
        assertFalse(d.allowed());
        assertEquals(Reason.REVOKED, d.reason());
    }

    @Test
    void billable_linked_unsubscribedWithFreePool_overLimitStateStillBlocks() {
        // Defensive: an explicit OVER_LIMIT state blocks even if a stale free count looks positive.
        InstanceEntitlement conflicting =
                new InstanceEntitlement(false, 5, 0, null, EntitlementState.OVER_LIMIT);
        GateDecision d =
                InstanceEntitlementGate.decide(true, true, true, Optional.of(conflicting), false);
        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }

    // --- grace window (evaluate()) ---------------------------------------------------------------

    private InstanceEntitlementGate gate(AccountLinkProperties props) {
        return new InstanceEntitlementGate(
                props, credentialStore, entitlementCache, syncStateRepository);
    }

    private static AccountLinkProperties props(boolean meteringEnabled, int graceDays) {
        AccountLinkProperties p = new AccountLinkProperties();
        p.setEnabled(true);
        p.getMetering().setEnabled(meteringEnabled);
        p.getMetering().setGraceDays(graceDays);
        return p;
    }

    @Test
    void evaluate_meteringOff_unreachable_failsOpen_neverGraceBlocks() {
        when(credentialStore.isLinked()).thenReturn(true);
        when(entitlementCache.current()).thenReturn(Optional.empty());

        GateDecision d = gate(props(false, 3)).evaluate(true);

        // Metering off → grace never applies, even if a sync is ancient.
        assertTrue(d.allowed());
        assertEquals(Reason.FAIL_OPEN, d.reason());
    }

    @Test
    void evaluate_neverSynced_pastGraceSinceLink_blocks() {
        when(credentialStore.isLinked()).thenReturn(true);
        when(entitlementCache.current()).thenReturn(Optional.empty());
        when(syncStateRepository.findById(AccountLinkSyncState.SINGLETON_ID))
                .thenReturn(Optional.empty());
        DeviceCredential cred = new DeviceCredential();
        cred.setLinkedAt(LocalDateTime.now().minusDays(5));
        when(credentialStore.get()).thenReturn(Optional.of(cred));

        GateDecision d = gate(props(true, 3)).evaluate(true);

        assertFalse(d.allowed());
        assertEquals(Reason.GRACE_EXPIRED, d.reason());
    }

    @Test
    void evaluate_recentSync_withinGrace_failsOpen() {
        when(credentialStore.isLinked()).thenReturn(true);
        when(entitlementCache.current()).thenReturn(Optional.empty());
        AccountLinkSyncState state = new AccountLinkSyncState();
        state.setLastSuccessAt(LocalDateTime.now().minusDays(1));
        when(syncStateRepository.findById(AccountLinkSyncState.SINGLETON_ID))
                .thenReturn(Optional.of(state));

        GateDecision d = gate(props(true, 3)).evaluate(true);

        assertTrue(d.allowed());
        assertEquals(Reason.FAIL_OPEN, d.reason());
    }
}
