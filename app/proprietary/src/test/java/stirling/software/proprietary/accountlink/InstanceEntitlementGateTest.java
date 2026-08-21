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
    @Mock private LocalUsageService localUsageService;

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
                InstanceEntitlementGate.decide(false, true, false, Optional.empty(), false, 0L);
        assertTrue(d.allowed());
        assertEquals(Reason.FLAG_OFF, d.reason());
    }

    @Test
    void manualTool_alwaysFree_evenUnlinked() {
        GateDecision d =
                InstanceEntitlementGate.decide(true, false, false, Optional.empty(), false, 0L);
        assertTrue(d.allowed());
        assertEquals(Reason.MANUAL_FREE, d.reason());
    }

    @Test
    void billable_notLinked_blocksWithLinkSignal() {
        GateDecision d =
                InstanceEntitlementGate.decide(true, true, false, Optional.empty(), false, 0L);
        assertFalse(d.allowed());
        assertEquals(Reason.NOT_LINKED, d.reason());
    }

    @Test
    void billable_linked_entitlementUnreachable_withinGrace_failsOpen() {
        GateDecision d =
                InstanceEntitlementGate.decide(true, true, true, Optional.empty(), false, 0L);
        assertTrue(d.allowed());
        assertEquals(Reason.FAIL_OPEN, d.reason());
    }

    @Test
    void billable_linked_entitlementUnreachable_graceExpired_blocks() {
        GateDecision d =
                InstanceEntitlementGate.decide(true, true, true, Optional.empty(), true, 0L);
        assertFalse(d.allowed());
        assertEquals(Reason.GRACE_EXPIRED, d.reason());
    }

    @Test
    void billable_linked_freePoolAvailable_allows() {
        GateDecision d =
                InstanceEntitlementGate.decide(true, true, true, Optional.of(free()), false, 0L);
        assertTrue(d.allowed());
        assertEquals(Reason.ENTITLED, d.reason());
    }

    @Test
    void billable_linked_unsubscribed_pendingLocalUsageDepletesGrant_blocks() {
        // free() has 100 free units left per the last sync; 100 accrued locally since would exhaust
        // it once charged, so the gate stops here in real time rather than waiting for the sync.
        GateDecision d =
                InstanceEntitlementGate.decide(true, true, true, Optional.of(free()), false, 100L);
        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }

    @Test
    void billable_linked_unsubscribed_pendingLocalUsageLeavesRoom_allows() {
        // 99 pending against 100 remaining → one unit of grant still projected free → allow.
        GateDecision d =
                InstanceEntitlementGate.decide(true, true, true, Optional.of(free()), false, 99L);
        assertTrue(d.allowed());
        assertEquals(Reason.ENTITLED, d.reason());
    }

    @Test
    void billable_linked_unsubscribedAndExhausted_blocksOverLimit() {
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(exhaustedUnsubscribed()), false, 0L);
        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }

    @Test
    void billable_linked_subscribedWithinCap_allows() {
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(subscribedWithinCap()), false, 0L);
        assertTrue(d.allowed());
        assertEquals(Reason.ENTITLED, d.reason());
    }

    @Test
    void billable_linked_subscribedOverCap_blocks() {
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(subscribedOverCap()), false, 0L);
        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }

    @Test
    void billable_linked_subscribedCapped_pendingLocalUsageWouldExceedCap_blocks() {
        // Within cap per the last sync (spend 10 / cap 100), but 95 accrued locally since would
        // push
        // projected spend to 105 → the gate stops now, not after the next sync reconciles.
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(subscribedWithinCap()), false, 95L);
        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }

    @Test
    void billable_linked_subscribedCapped_pendingLeavesCapRoom_allows() {
        // 10 synced + 80 pending = 90 < 100 cap → still room.
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(subscribedWithinCap()), false, 80L);
        assertTrue(d.allowed());
        assertEquals(Reason.ENTITLED, d.reason());
    }

    @Test
    void billable_linked_subscribedCapped_freeGrantAbsorbsPending_allows() {
        // 50 free units remain, so 40 pending is entirely free → 0 projected paid < 100 cap →
        // allow.
        InstanceEntitlement subscribedWithGrant =
                new InstanceEntitlement(true, 50, 0, 100L, EntitlementState.OK);
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(subscribedWithGrant), false, 40L);
        assertTrue(d.allowed());
        assertEquals(Reason.ENTITLED, d.reason());
    }

    @Test
    void billable_linked_subscribedUncapped_pendingIgnored_allows() {
        // No cap → local pending has no ceiling to hit → always allowed.
        InstanceEntitlement uncapped =
                new InstanceEntitlement(true, 0, 999, null, EntitlementState.OK);
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(uncapped), false, 500L);
        assertTrue(d.allowed());
        assertEquals(Reason.ENTITLED, d.reason());
    }

    @Test
    void billable_linked_revoked_blocksWithRevokedSignal() {
        // Authoritative deny (revoked/invalid credential) surfaced by the cache as REVOKED —
        // blocks distinctly from over-limit, even though the snapshot is "present".
        InstanceEntitlement revoked =
                new InstanceEntitlement(false, 0, 0, null, EntitlementState.REVOKED);
        GateDecision d =
                InstanceEntitlementGate.decide(true, true, true, Optional.of(revoked), false, 0L);
        assertFalse(d.allowed());
        assertEquals(Reason.REVOKED, d.reason());
    }

    @Test
    void billable_linked_unsubscribedWithFreePool_overLimitStateStillBlocks() {
        // Defensive: an explicit OVER_LIMIT state blocks even if a stale free count looks positive.
        InstanceEntitlement conflicting =
                new InstanceEntitlement(false, 5, 0, null, EntitlementState.OVER_LIMIT);
        GateDecision d =
                InstanceEntitlementGate.decide(
                        true, true, true, Optional.of(conflicting), false, 0L);
        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }

    // --- grace window (evaluate()) ---------------------------------------------------------------

    private InstanceEntitlementGate gate(AccountLinkProperties props) {
        return new InstanceEntitlementGate(
                props, credentialStore, entitlementCache, syncStateRepository, localUsageService);
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

    @Test
    void evaluate_unsubscribed_localUsageWouldExceedGrant_blocksInRealTime() {
        // 100 free units remaining per the last sync, but 100 already accrued locally since — the
        // gate subtracts the pending delta and blocks now, not after the next sync reconciles.
        when(credentialStore.isLinked()).thenReturn(true);
        when(entitlementCache.current()).thenReturn(Optional.of(free()));
        when(localUsageService.currentPeriodUnsynced())
                .thenReturn(new LocalUsageService.LocalUsage(LocalDateTime.now(), 100, 0, 0, 100));

        GateDecision d = gate(props(true, 3)).evaluate(true);

        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }

    @Test
    void evaluate_subscribedCapped_localUsageWouldExceedCap_blocksInRealTime() {
        // Subscribed within cap per the last sync (spend 10 / cap 100), but 90 accrued locally
        // since — evaluate() now depletes the cap by pending usage for capped subscriptions too, so
        // the gate stops now instead of overshooting the cap until the next sync.
        when(credentialStore.isLinked()).thenReturn(true);
        when(entitlementCache.current()).thenReturn(Optional.of(subscribedWithinCap()));
        when(localUsageService.currentPeriodUnsynced())
                .thenReturn(new LocalUsageService.LocalUsage(LocalDateTime.now(), 0, 90, 0, 90));

        GateDecision d = gate(props(true, 3)).evaluate(true);

        assertFalse(d.allowed());
        assertEquals(Reason.OVER_LIMIT, d.reason());
    }
}
