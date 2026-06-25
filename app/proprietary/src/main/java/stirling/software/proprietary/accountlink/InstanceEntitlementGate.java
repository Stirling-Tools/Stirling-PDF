package stirling.software.proprietary.accountlink;

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
 *   <li>Billable + linked + entitlement unknown (unreachable) → <b>fail open</b>, allow.
 *   <li>Billable + linked + entitled → allow.
 *   <li>Billable + linked + credential revoked → block with {@code REVOKED}.
 *   <li>Billable + linked + over limit → block with {@code OVER_LIMIT}.
 * </ol>
 *
 * <p>The decision logic is the pure static {@link #decide}; the Spring wrapper just supplies the
 * live flag / linked-state / entitlement. This is the unit-tested core.
 */
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class InstanceEntitlementGate {

    private final AccountLinkProperties properties;
    private final DeviceCredentialStore credentialStore;
    private final EntitlementCache entitlementCache;

    public InstanceEntitlementGate(
            AccountLinkProperties properties,
            DeviceCredentialStore credentialStore,
            EntitlementCache entitlementCache) {
        this.properties = properties;
        this.credentialStore = credentialStore;
        this.entitlementCache = entitlementCache;
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
        return decide(true, true, linked, entitlement);
    }

    /**
     * Pure decision function — no Spring, no I/O. {@code entitlement} empty means "unknown"
     * (unreachable): when linked, that fails open.
     */
    public static GateDecision decide(
            boolean flagEnabled,
            boolean billable,
            boolean linked,
            Optional<InstanceEntitlement> entitlement) {
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
            // Linked but entitlement source unreachable — never hard-block billable work on our
            // inability to reach billing.
            return GateDecision.allow(GateDecision.Reason.FAIL_OPEN);
        }
        InstanceEntitlement e = entitlement.get();
        if (e.state() == EntitlementState.REVOKED) {
            // Credential revoked/invalid (authoritative deny) — block, distinct from over-limit.
            return GateDecision.block(GateDecision.Reason.REVOKED);
        }
        return entitled(e)
                ? GateDecision.allow(GateDecision.Reason.ENTITLED)
                : GateDecision.block(GateDecision.Reason.OVER_LIMIT);
    }

    /** True when the snapshot permits billable work (subscribed, free pool left, or within cap). */
    private static boolean entitled(InstanceEntitlement e) {
        if (e.state() == EntitlementState.OVER_LIMIT || e.state() == EntitlementState.REVOKED) {
            return false;
        }
        if (e.subscribed()) {
            // Subscribed: allowed unless a period cap is set and exceeded.
            return e.periodCapUnits() == null || e.periodSpendUnits() < e.periodCapUnits();
        }
        // Unsubscribed: only the free pool covers billable work.
        return e.freeRemainingUnits() > 0;
    }
}
