package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

/**
 * Decides whether a request may proceed under combined-billing "Mode A" on a self-hosted instance.
 *
 * <p>Rules (in order):
 *
 * <ol>
 *   <li>Flag off → always allow (feature inert).
 *   <li>Manual tool → always allow (manual tools are free, never metered).
 *   <li>Billable + not linked → block with {@code NOT_LINKED} ("link to activate").
 *   <li>Billable + linked + entitlement unknown (unreachable) → <b>fail open</b>, allow — unless
 *       metering is on and SaaS has been unreachable past the grace window, then block with {@code
 *       GRACE_EXPIRED} so the fail-open can't grant unbounded free/unbilled work forever.
 *   <li>Billable + linked + entitled → allow.
 *   <li>Billable + linked + credential revoked → block with {@code REVOKED}.
 *   <li>Billable + linked + over limit → block with {@code OVER_LIMIT}.
 * </ol>
 *
 * <p>The decision logic is the pure static {@link #decide}; the Spring wrapper supplies the live
 * flag / linked-state / entitlement and computes whether the grace window has expired. This is the
 * unit-tested core.
 */
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class InstanceEntitlementGate {

    private final AccountLinkProperties properties;
    private final DeviceCredentialStore credentialStore;
    private final EntitlementCache entitlementCache;
    private final AccountLinkSyncStateRepository syncStateRepository;
    private final LocalUsageService localUsageService;

    public InstanceEntitlementGate(
            AccountLinkProperties properties,
            DeviceCredentialStore credentialStore,
            EntitlementCache entitlementCache,
            AccountLinkSyncStateRepository syncStateRepository,
            LocalUsageService localUsageService) {
        this.properties = properties;
        this.credentialStore = credentialStore;
        this.entitlementCache = entitlementCache;
        this.syncStateRepository = syncStateRepository;
        this.localUsageService = localUsageService;
    }

    /** Evaluates the gate for a request, resolving live state from the store + cache. */
    public GateDecision evaluate(boolean billable) {
        if (!properties.isEnabled()) {
            return GateDecision.allow(GateDecision.Reason.FLAG_OFF);
        }
        if (!billable) {
            return GateDecision.allow(GateDecision.Reason.MANUAL_FREE);
        }
        boolean linked = credentialStore.isLinked();
        Optional<InstanceEntitlement> entitlement =
                linked ? entitlementCache.current() : Optional.empty();
        boolean graceExpired = linked && entitlement.isEmpty() && isGraceExpired();
        // For an unsubscribed team the one-time free grant is the ceiling, and it depletes in real
        // time as billable work accrues locally between daily syncs. Subtract the not-yet-synced
        // local usage from the last-synced free balance so the gate stops AT the grant, rather than
        // running until the next sync charges the backlog and only then flips. Subscribed teams
        // bill
        // past the grant (their gate is the money cap), so this doesn't apply to them — pass 0.
        long pendingUnsynced =
                entitlement.map(e -> !e.subscribed()).orElse(false)
                        ? localUsageService.currentPeriodUnsynced().totalUnsyncedUnits()
                        : 0L;
        return decide(true, true, linked, entitlement, graceExpired, pendingUnsynced);
    }

    /**
     * Pure decision function — no Spring, no I/O. {@code entitlement} empty means "unknown"
     * (unreachable): when linked, that fails open unless {@code graceExpired} (the metering grace
     * window elapsed with no authoritative contact), in which case it blocks.
     *
     * @param pendingUnsyncedUnits billable units accrued locally since the last sync — subtracted
     *     from an unsubscribed team's free balance so the grant depletes in real time (0 for
     *     subscribed / unknown-entitlement cases, where it has no effect).
     */
    public static GateDecision decide(
            boolean flagEnabled,
            boolean billable,
            boolean linked,
            Optional<InstanceEntitlement> entitlement,
            boolean graceExpired,
            long pendingUnsyncedUnits) {
        if (!flagEnabled) {
            return GateDecision.allow(GateDecision.Reason.FLAG_OFF);
        }
        if (!billable) {
            return GateDecision.allow(GateDecision.Reason.MANUAL_FREE);
        }
        if (!linked) {
            return GateDecision.block(GateDecision.Reason.NOT_LINKED);
        }
        if (entitlement.isEmpty()) {
            // Linked but entitlement source unreachable. Normally fail open (never hard-block on
            // our
            // inability to reach billing) — but once the grace window has expired, block so the
            // fail-open can't grant unbounded free/unbilled billable work indefinitely.
            return graceExpired
                    ? GateDecision.block(GateDecision.Reason.GRACE_EXPIRED)
                    : GateDecision.allow(GateDecision.Reason.FAIL_OPEN);
        }
        InstanceEntitlement e = entitlement.get();
        if (e.state() == EntitlementState.REVOKED) {
            // Credential revoked/invalid (authoritative deny) — block, distinct from over-limit.
            return GateDecision.block(GateDecision.Reason.REVOKED);
        }
        return entitled(e, pendingUnsyncedUnits)
                ? GateDecision.allow(GateDecision.Reason.ENTITLED)
                : GateDecision.block(GateDecision.Reason.OVER_LIMIT);
    }

    /**
     * True when metering is on and SaaS has been unreachable past the grace window — i.e. it's been
     * {@code graceDays} since the last authoritative contact. The reference is the last successful
     * daily sync (persisted, survives restart), falling back to the link time for a never-synced
     * instance. {@code graceDays <= 0} disables the backstop; metering off never blocks (nothing
     * accrues, so a stale sync must not gate manual-free or pre-metering work).
     */
    private boolean isGraceExpired() {
        AccountLinkProperties.Metering metering = properties.getMetering();
        if (!metering.isEnabled() || metering.getGraceDays() <= 0) {
            return false;
        }
        LocalDateTime reference = lastAuthoritativeContact();
        if (reference == null) {
            return false; // can't determine elapsed time → fail open
        }
        return reference.plusDays(metering.getGraceDays()).isBefore(LocalDateTime.now());
    }

    private LocalDateTime lastAuthoritativeContact() {
        LocalDateTime lastSuccess =
                syncStateRepository
                        .findById(AccountLinkSyncState.SINGLETON_ID)
                        .map(AccountLinkSyncState::getLastSuccessAt)
                        .orElse(null);
        if (lastSuccess != null) {
            return lastSuccess;
        }
        return credentialStore.get().map(DeviceCredential::getLinkedAt).orElse(null);
    }

    /** True when the snapshot permits billable work (subscribed, free pool left, or within cap). */
    private static boolean entitled(InstanceEntitlement e, long pendingUnsyncedUnits) {
        if (e.state() == EntitlementState.OVER_LIMIT || e.state() == EntitlementState.REVOKED) {
            return false;
        }
        if (e.subscribed()) {
            // Subscribed: allowed unless a period cap is set and exceeded.
            return e.periodCapUnits() == null || e.periodSpendUnits() < e.periodCapUnits();
        }
        // Unsubscribed: the free pool must cover both what SaaS has already charged (already netted
        // out of freeRemainingUnits) and the local usage accrued since the last sync but not yet
        // reported. Depleting by the pending delta stops the (grant+1)-th unit here in real time,
        // instead of allowing it until a sync reconciles and the gate belatedly flips.
        return e.freeRemainingUnits() - pendingUnsyncedUnits > 0;
    }
}
