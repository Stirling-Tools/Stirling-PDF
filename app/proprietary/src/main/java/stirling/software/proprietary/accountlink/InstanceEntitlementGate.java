package stirling.software.proprietary.accountlink;

import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import stirling.software.common.service.LicenseServiceInterface;

/**
 * Enforces cloud processing allowance and the shared offline deadline; manual tools remain free.
 */
@Service
@Profile("!saas")
@ConditionalOnProperty(
        name = "stirling.billing.account-link.enabled",
        havingValue = "true",
        matchIfMissing = true)
public class InstanceEntitlementGate {

    private final LicenseServiceInterface licenseService;
    private final AccountLinkProperties properties;
    private final DeviceCredentialStore credentialStore;
    private final EntitlementCache entitlementCache;
    private final LocalUsageService localUsageService;
    private final FreeTierUsageService freeTierUsageService;

    public InstanceEntitlementGate(
            AccountLinkProperties properties,
            DeviceCredentialStore credentialStore,
            EntitlementCache entitlementCache,
            LocalUsageService localUsageService,
            FreeTierUsageService freeTierUsageService,
            LicenseServiceInterface licenseService) {
        this.licenseService = licenseService;
        this.properties = properties;
        this.credentialStore = credentialStore;
        this.entitlementCache = entitlementCache;
        this.localUsageService = localUsageService;
        this.freeTierUsageService = freeTierUsageService;
    }

    /** Evaluates the gate for a request, resolving live state from the store + cache. */
    public GateDecision evaluate(boolean billable) {
        if (!properties.isEnabled()) {
            return GateDecision.allow(GateDecision.Reason.FLAG_OFF);
        }
        if (!billable) {
            return GateDecision.allow(GateDecision.Reason.MANUAL_FREE);
        }
        if (licenseService.isRunningEE()) {
            return GateDecision.allow(GateDecision.Reason.ENTERPRISE_LICENSE);
        }
        boolean linked = credentialStore.isLinked();
        long freeTierRemaining = linked ? 0L : freeTierUsageService.balance().remainingUnits();
        Optional<InstanceEntitlement> entitlement =
                linked ? entitlementCache.current() : Optional.empty();
        boolean graceExpired = linked && entitlementCache.isGraceExpired();
        if (entitlement.isPresent() && entitlement.get().state() == EntitlementState.REVOKED) {
            return GateDecision.block(GateDecision.Reason.REVOKED);
        }
        if (graceExpired) return GateDecision.block(GateDecision.Reason.GRACE_EXPIRED);
        // Deplete the applicable ceiling — free grant (unsubscribed) or spend cap (capped
        // subscription) — by local usage not yet synced, so the gate stops in real time instead of
        // overshooting until the next sync. An uncapped subscription has no ceiling to deplete → 0.
        long pendingUnsynced =
                entitlement.map(InstanceEntitlementGate::depletesCeiling).orElse(false)
                        ? localUsageService.currentPeriodUnsynced().totalUnsyncedUnits()
                        : 0L;
        return decide(
                true, true, linked, entitlement, graceExpired, pendingUnsynced, freeTierRemaining);
    }

    /** Whether local unsynced usage pushes against a real ceiling (free grant or a spend cap). */
    private static boolean depletesCeiling(InstanceEntitlement e) {
        return !e.subscribed() || e.periodCapUnits() != null;
    }

    /**
     * Pure decision function — no Spring, no I/O. {@code entitlement} empty means "unknown"
     * (unreachable): when linked, that fails open unless {@code graceExpired} (the metering grace
     * window elapsed with no authoritative contact), in which case it blocks.
     *
     * @param pendingUnsyncedUnits billable units accrued locally since the last sync — depletes the
     *     free grant (unsubscribed) or the spend cap (capped subscription) in real time so the gate
     *     stops without waiting for the next sync (0 for uncapped-subscribed / unknown-entitlement
     *     cases, where it has no effect).
     * @param freeTierRemainingUnits the sole ceiling when unlinked. 0 blocks, so a caller that
     *     cannot read the local ledger must throw instead: a throw fails open, 0 reads as empty.
     */
    public static GateDecision decide(
            boolean flagEnabled,
            boolean billable,
            boolean linked,
            Optional<InstanceEntitlement> entitlement,
            boolean graceExpired,
            long pendingUnsyncedUnits,
            long freeTierRemainingUnits) {
        if (!flagEnabled) {
            return GateDecision.allow(GateDecision.Reason.FLAG_OFF);
        }
        if (!billable) {
            return GateDecision.allow(GateDecision.Reason.MANUAL_FREE);
        }
        if (!linked) {
            return freeTierRemainingUnits > 0
                    ? GateDecision.allow(GateDecision.Reason.FREE_TIER)
                    : GateDecision.block(GateDecision.Reason.FREE_TIER_EXHAUSTED);
        }
        if (entitlement.isPresent() && entitlement.get().state() == EntitlementState.REVOKED) {
            return GateDecision.block(GateDecision.Reason.REVOKED);
        }
        if (graceExpired) return GateDecision.block(GateDecision.Reason.GRACE_EXPIRED);
        if (entitlement.isEmpty()) return GateDecision.allow(GateDecision.Reason.FAIL_OPEN);
        InstanceEntitlement e = entitlement.get();
        if (e.state() == EntitlementState.REVOKED) {
            // Credential revoked/invalid (authoritative deny) — block, distinct from over-limit.
            return GateDecision.block(GateDecision.Reason.REVOKED);
        }
        return entitled(e, pendingUnsyncedUnits)
                ? GateDecision.allow(GateDecision.Reason.ENTITLED)
                : GateDecision.block(GateDecision.Reason.OVER_LIMIT);
    }

    /** True when the snapshot permits billable work (subscribed, free pool left, or within cap). */
    private static boolean entitled(InstanceEntitlement e, long pendingUnsyncedUnits) {
        if (e.state() == EntitlementState.OVER_LIMIT || e.state() == EntitlementState.REVOKED) {
            return false;
        }
        long pendingAfterIncluded = Math.max(0, pendingUnsyncedUnits - e.freeRemainingUnits());
        if (e.freeRemainingUnits() > Math.max(0, pendingUnsyncedUnits)
                || e.prepaidRemainingUnits() > pendingAfterIncluded) {
            return true;
        }
        if (e.subscribed()) {
            if (e.periodCapUnits() == null) {
                return true; // uncapped subscription
            }
            // Project the cap the way the grant is projected: synced paid spend plus the paid part
            // of local usage not yet synced (free grant is consumed first, so only the excess
            // bills) — stops at the cap in real time instead of overshooting until the next sync.
            long pendingPaid = Math.max(0, pendingAfterIncluded - e.prepaidRemainingUnits());
            return e.periodSpendUnits() + pendingPaid < e.periodCapUnits();
        }
        // Unsubscribed: free pool must cover SaaS-charged usage (in freeRemainingUnits) plus local
        // usage not yet synced — deplete by the pending delta so we stop at the grant in real time.
        return e.freeRemainingUnits() - pendingUnsyncedUnits > 0;
    }
}
