package stirling.software.saas.payg.instance;

import java.time.LocalDateTime;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.charge.ChargeContext;
import stirling.software.saas.payg.charge.JobChargeService;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;
import stirling.software.saas.payg.repository.PaygInstanceUsageRepository;

/**
 * Ingests a linked self-hosted instance's daily usage sync (combined-billing "Mode A").
 *
 * <p>The instance reports a <b>monotonic cumulative</b> unit total per {@link BillingCategory} for
 * the current billing period. We bill only the <b>delta</b> since the last sync, which makes the
 * model idempotent (a resend reports the same total → delta 0 → no charge) and tamper-evident (a
 * total that goes backwards is refused, not credited; a monotonic {@code syncSeq} dedups replays).
 * The charge itself <b>reuses {@link JobChargeService#chargeStandalone}</b> — the same free-grant
 * split, {@code wallet_ledger} DEBIT, Stripe meter, and idempotency the in-cloud charge path uses —
 * so there is no separate billing logic for this flow.
 *
 * <p><b>Cap enforcement is the request-time gate's job, not this charge path's</b> — exactly as the
 * in-cloud path enforces the cap at {@code EntitlementGuard}, not in {@code JobChargeService}. The
 * instance's own {@code InstanceEntitlementGate} blocks billable work once the team is over its cap
 * (a $0 cap blocks everything metered), so usage stops accruing at the cap and the reported delta
 * does not run past it. We deliberately do NOT re-check the cap here: a customer is never charged
 * past a limit their gate already enforces, and the only residual is the bounded
 * (~entitlement-cache TTL) overshoot inherent to any eventually-consistent meter. If the instance
 * ever meters past the cap that is an instance bug to fix, not something this aggregate path should
 * silently absorb.
 *
 * <p>{@code minChargeUnits} is applied by {@code chargeStandalone} <b>per sync-delta</b> here,
 * which intentionally differs from the per-operation floor in-cloud: the cumulative-delta model
 * carries no per-op identity, so a daily delta of D bills {@code max(D, minChargeUnits)} once, not
 * per underlying op. With the shipped default ({@code minChargeUnits=1}) this is a no-op (the
 * delta>0 guard already covers the only floored case).
 *
 * <p>Gated behind {@code stirling.billing.account-link.enabled}.
 */
@Slf4j
@Service
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class InstanceUsageIngestService {

    private final PaygInstanceUsageRepository usageRepository;
    private final JobChargeService chargeService;

    public InstanceUsageIngestService(
            PaygInstanceUsageRepository usageRepository, JobChargeService chargeService) {
        this.usageRepository = usageRepository;
        this.chargeService = chargeService;
    }

    /**
     * Bills the delta for each category and advances the last-seen cumulative + sync sequence. The
     * delta-advance and the charge share this transaction, so a crash before commit re-bills
     * cleanly on retry (delta unchanged) and a commit means the cumulative moved with the charge.
     *
     * @param actorUserId the linking admin ({@code linked_instance.created_by_user_id}); required
     *     to attribute the charge. If {@code null} we skip entirely (don't advance) so a later
     *     sync, once the actor is resolvable, still bills the usage.
     */
    @Transactional
    public void ingest(
            Long teamId,
            Long actorUserId,
            long syncSeq,
            LocalDateTime periodStart,
            Map<BillingCategory, Long> cumulativeByCategory) {
        if (teamId == null || periodStart == null || cumulativeByCategory == null) {
            return;
        }
        if (actorUserId == null) {
            log.warn(
                    "Instance usage sync for team {} has no actor (created_by_user_id null); not"
                            + " billing — a later sync will pick it up.",
                    teamId);
            return;
        }
        cumulativeByCategory.forEach(
                (category, cumulative) -> {
                    if (category == null
                            || category == BillingCategory.BYPASSED
                            || cumulative == null
                            || cumulative < 0) {
                        return;
                    }
                    applyCategory(teamId, actorUserId, syncSeq, periodStart, category, cumulative);
                });
    }

    private void applyCategory(
            Long teamId,
            Long actorUserId,
            long syncSeq,
            LocalDateTime periodStart,
            BillingCategory category,
            long cumulative) {
        // Pessimistic row lock: an external duplicate delivery of the same sync (e.g. a proxy
        // retry) would otherwise let two transactions read the same baseline and both charge the
        // delta. Locking serialises them — the second sees the advanced seq and replay-skips. A
        // first-insert race is caught by uk_payg_instance_usage (the losing txn rolls back + the
        // instance retries next sync).
        PaygInstanceUsage row =
                usageRepository
                        .findByTeamIdAndPeriodStartAndCategoryForUpdate(
                                teamId, periodStart, category.name())
                        .orElse(null);
        if (row != null && syncSeq <= row.getLastSyncSeq()) {
            return; // replay / out-of-order — already applied this or a later sync
        }
        long lastCumulative = row == null ? 0L : row.getLastCumulativeUnits();
        long delta = cumulative - lastCumulative;
        if (delta < 0) {
            // The cumulative counter went backwards — a reset or tampering. Refuse to credit; don't
            // advance, so the discrepancy stays visible and a corrected resend can reconcile.
            log.warn(
                    "Instance usage regression team={} category={} reported {} < last {}; ignoring.",
                    teamId,
                    category,
                    cumulative,
                    lastCumulative);
            return;
        }
        if (delta > 0) {
            int units = (int) Math.min(delta, Integer.MAX_VALUE);
            chargeService.chargeStandalone(
                    new ChargeContext(
                            actorUserId,
                            teamId,
                            JobSource.LINKED_INSTANCE,
                            ProcessType.SINGLE_TOOL,
                            category),
                    units);
        }
        if (row == null) {
            row = new PaygInstanceUsage(teamId, periodStart, category.name(), cumulative, syncSeq);
        } else {
            row.setLastCumulativeUnits(cumulative);
            row.setLastSyncSeq(syncSeq);
        }
        usageRepository.save(row);
    }
}
