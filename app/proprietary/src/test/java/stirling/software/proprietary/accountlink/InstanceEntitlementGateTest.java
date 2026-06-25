package stirling.software.proprietary.accountlink;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Optional;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.accountlink.GateDecision.Reason;

/**
 * Covers the gate decision matrix: flag-off, manual-free, unlinked, fail-open, linked-free, and
 * over-limit. Exercises the pure {@link InstanceEntitlementGate#decide} so no Spring / I/O is
 * needed.
 */
class InstanceEntitlementGateTest {

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
        GateDecision d = InstanceEntitlementGate.decide(false, true, false, Optional.empty());
        assertTrue(d.allowed());
        assertEquals(Reason.FLAG_OFF, d.reason());
    }

    @Test
    void manualTool_alwaysFree_evenUnlinked() {
        GateDecision d = InstanceEntitlementGate.decide(true, false, false, Optional.empty());
        assertTrue(d.allowed());
        assertEquals(Reason.MANUAL_FREE, d.reason());
    }

    @Test
    void billable_notLinked_blocksWithLinkSignal() {
        GateDecision d = InstanceEntitlementGate.decide(true, true, false, Optional.empty());
        assertFalse(d.allowed());
        assertEquals(Reason.NOT_LINKED, d.reason());
    }

    @Test
    void billable_linked_entitlementUnreachable_failsOpen() {
        GateDecision d = InstanceEntitlementGate.decide(true, true, true, Optional.empty());
        assertTrue(d.allowed());
        assertEquals(Reason.FAIL_OPEN, d.reason());
    }

    @Test
    void billable_linked_freePoolAvailable_allows() {
        GateDecision d = InstanceEntitlementGate.decide(true, true, true, Optional.of(free()));
        assertTrue(d.allowed());
        assertEquals(Reason.ENTITLED, d.reason());
    }

    @Test
    void billable_linked_unsubscribedAndExhausted_blocksOverLimit() {
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(exhaustedUnsubscribed()));
        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }

    @Test
    void billable_linked_subscribedWithinCap_allows() {
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(subscribedWithinCap()));
        assertTrue(d.allowed());
        assertEquals(Reason.ENTITLED, d.reason());
    }

    @Test
    void billable_linked_subscribedOverCap_blocks() {
        GateDecision d =
                InstanceEntitlementGate.decide(true, true, true, Optional.of(subscribedOverCap()));
        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }

    @Test
    void billable_linked_revoked_blocksWithRevokedSignal() {
        // Authoritative deny (revoked/invalid credential) surfaced by the cache as REVOKED —
        // blocks distinctly from over-limit, even though the snapshot is "present".
        InstanceEntitlement revoked =
                new InstanceEntitlement(false, 0, 0, null, EntitlementState.REVOKED);
        GateDecision d = InstanceEntitlementGate.decide(true, true, true, Optional.of(revoked));
        assertFalse(d.allowed());
        assertEquals(Reason.REVOKED, d.reason());
    }

    @Test
    void billable_linked_unsubscribedWithFreePool_overLimitStateStillBlocks() {
        // Defensive: an explicit OVER_LIMIT state blocks even if a stale free count looks positive.
        InstanceEntitlement conflicting =
                new InstanceEntitlement(false, 5, 0, null, EntitlementState.OVER_LIMIT);
        GateDecision d = InstanceEntitlementGate.decide(true, true, true, Optional.of(conflicting));
        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }
}
