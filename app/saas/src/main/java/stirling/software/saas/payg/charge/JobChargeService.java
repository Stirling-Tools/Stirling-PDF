package stirling.software.saas.payg.charge;

import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.billing.TeamBillingContext;
import stirling.software.saas.payg.billing.TeamBillingService;
import stirling.software.saas.payg.docs.DocumentClassifier;
import stirling.software.saas.payg.docs.DocumentMetrics;
import stirling.software.saas.payg.job.JobContext;
import stirling.software.saas.payg.job.JobService;
import stirling.software.saas.payg.job.JoinOrOpenResult;
import stirling.software.saas.payg.job.ProcessingJob;
import stirling.software.saas.payg.meter.PaygMeterReportingService;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.JobStatus;
import stirling.software.saas.payg.model.LedgerBucket;
import stirling.software.saas.payg.model.LedgerEntryType;
import stirling.software.saas.payg.model.ReferenceType;
import stirling.software.saas.payg.model.ShadowChargeStatus;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.policy.PricingPolicyService;
import stirling.software.saas.payg.repository.PaygShadowChargeRepository;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.ProcessingJobRepository;
import stirling.software.saas.payg.repository.WalletLedgerRepository;
import stirling.software.saas.payg.shadow.PaygShadowCharge;
import stirling.software.saas.payg.wallet.WalletLedgerEntry;

/**
 * Orchestrates a tool call's open-process decision: look up the team's effective policy, resolve
 * the step-limit ceiling for this caller surface, delegate the join-or-open decision to {@link
 * JobService}, and — when a new process opens — compute the would-be charge and record a {@link
 * PaygShadowCharge} row for comparison against the legacy engine.
 *
 * <p>Shadow mode only: this service never debits the wallet ledger or posts a Stripe meter event.
 * The real-charging path lives in a separate follow-up and reuses the same orchestration — only the
 * side-effect (shadow row vs ledger entry + Stripe call) differs.
 *
 * <p>The {@code legacyCreditsCharged} field on the shadow row is set to {@code 0} here. When the
 * legacy {@code CreditService} is wired to call this service (separate PR), the legacy debit amount
 * becomes available and {@code diffPct} can be computed against it; until then the shadow row
 * captures the PAYG units only.
 */
@Service
@Profile("saas")
@Slf4j
public class JobChargeService {

    private final JobService jobService;
    private final PricingPolicyService policyService;
    private final DocumentClassifier classifier;
    private final PaygShadowChargeRepository shadowRepository;
    private final ProcessingJobRepository jobRepository;
    private final PaygTeamExtensionsRepository teamExtensionsRepository;
    private final PaygMeterReportingService meterReportingService;
    private final WalletLedgerRepository ledgerRepository;
    private final TeamBillingService teamBillingService;

    public JobChargeService(
            JobService jobService,
            PricingPolicyService policyService,
            DocumentClassifier classifier,
            PaygShadowChargeRepository shadowRepository,
            ProcessingJobRepository jobRepository,
            PaygTeamExtensionsRepository teamExtensionsRepository,
            PaygMeterReportingService meterReportingService,
            WalletLedgerRepository ledgerRepository,
            TeamBillingService teamBillingService) {
        this.jobService = Objects.requireNonNull(jobService, "jobService");
        this.policyService = Objects.requireNonNull(policyService, "policyService");
        this.classifier = Objects.requireNonNull(classifier, "classifier");
        this.shadowRepository = Objects.requireNonNull(shadowRepository, "shadowRepository");
        this.jobRepository = Objects.requireNonNull(jobRepository, "jobRepository");
        this.teamExtensionsRepository =
                Objects.requireNonNull(teamExtensionsRepository, "teamExtensionsRepository");
        this.meterReportingService =
                Objects.requireNonNull(meterReportingService, "meterReportingService");
        this.ledgerRepository = Objects.requireNonNull(ledgerRepository, "ledgerRepository");
        this.teamBillingService = Objects.requireNonNull(teamBillingService, "teamBillingService");
    }

    /**
     * Open a process (or join an existing one) for this tool call. Side effects: persists a {@code
     * ProcessingJob} row plus input signatures, and — on OPENED — writes a {@code
     * payg_shadow_charge} row carrying the would-be PAYG units.
     */
    @Transactional
    public ChargeOutcome openProcess(ChargeContext ctx, List<JobInput> inputs) throws IOException {
        Objects.requireNonNull(ctx, "ctx");
        Objects.requireNonNull(inputs, "inputs");
        if (inputs.isEmpty()) {
            throw new IllegalArgumentException("inputs must not be empty");
        }

        PricingPolicy policy = policyService.getEffectivePolicy(ctx.ownerTeamId());
        int stepLimit = resolveStepLimit(policy, ctx.source());

        JobContext jobCtx =
                new JobContext(
                        ctx.ownerUserId(),
                        ctx.ownerTeamId(),
                        ctx.source(),
                        ctx.processType(),
                        policy.getId(),
                        stepLimit);

        List<Path> paths = inputs.stream().map(JobInput::path).toList();
        JoinOrOpenResult result = jobService.joinOrOpen(jobCtx, paths);

        if (result.disposition() == JoinOrOpenResult.Disposition.JOINED) {
            return new ChargeOutcome(result.job().getId(), 0, ChargeOutcome.Disposition.JOINED);
        }

        int units = computeUnits(inputs, policy);
        result.job().setDocUnits(units);

        recordShadowRow(ctx, result.job().getId(), policy.getId(), units);
        recordLedgerDebit(ctx, result.job().getId(), policy.getId(), units);

        return new ChargeOutcome(result.job().getId(), units, ChargeOutcome.Disposition.OPENED);
    }

    /**
     * The live spend record. Everything the customer-facing side reads — the wallet endpoint's
     * {@code spendUnitsThisPeriod}, the per-category breakdown ({@code wallet_category_summary}
     * view), and the cap evaluator's period sum — derives from {@code wallet_ledger} DEBITs. Shadow
     * rows are the comparison audit trail; this row is what actually counts.
     *
     * <p>Sign convention: debits are stored NEGATIVE (the entitlement snapshot negates the sum).
     * Skipped for {@code BYPASSED} / uncategorised calls — manual UI work is never billed.
     */
    private void recordLedgerDebit(
            ChargeContext ctx, java.util.UUID jobId, Long policyId, int units) {
        BillingCategory category = ctx.billingCategory();
        if (category == null || category == BillingCategory.BYPASSED) {
            return;
        }
        WalletLedgerEntry entry = new WalletLedgerEntry();
        entry.setTeamId(ctx.ownerTeamId());
        entry.setActorUserId(ctx.ownerUserId());
        entry.setEntryType(LedgerEntryType.DEBIT);
        entry.setBucket(LedgerBucket.CYCLE);
        entry.setAmountUnits(-units);
        entry.setReferenceType(ReferenceType.JOB);
        entry.setReferenceId(jobId.toString());
        entry.setPolicyId(policyId);
        entry.setBillingCategory(category);
        ledgerRepository.save(entry);
    }

    private int resolveStepLimit(PricingPolicy policy, JobSource source) {
        Integer fromPolicy =
                policy.getStepLimits() == null ? null : policy.getStepLimits().get(source);
        if (fromPolicy != null && fromPolicy > 0) {
            return fromPolicy;
        }
        // Defensive default — every JobSource should have an entry per the V12 seed, but a
        // hand-edited policy could be missing one. Fall back to the smallest documented limit
        // (10 — WEB/API/DESKTOP_APP default) so an admin slip-up never spawns unbounded chains.
        log.debug(
                "PricingPolicy {} missing stepLimit for source={}; using fallback of 10.",
                policy.getId(),
                source);
        return 10;
    }

    private int computeUnits(List<JobInput> inputs, PricingPolicy policy) {
        List<MultipartFile> multiparts = inputs.stream().map(JobInput::multipart).toList();
        // Reuse the temp file the caller already wrote (in PaygChargeInterceptor.preHandle for
        // lineage hashing) instead of materialising the same bytes a second time inside the
        // classifier. Saves one write + one read per PDF input.
        List<Path> paths = inputs.stream().map(JobInput::path).toList();
        DocumentMetrics metrics =
                multiparts.size() == 1
                        ? classifier.classify(multiparts.get(0), paths.get(0), policy)
                        : classifier.classify(multiparts, paths, policy);
        // Apply the policy-level minChargeUnits floor per design § 3.4. The classifier returns
        // raw docUnits with a "non-empty input → ≥1" floor; the charge formula's
        // max(min_charge_units, docUnits) layers on top.
        return Math.max(policy.getMinChargeUnits(), metrics.docUnits());
    }

    private void recordShadowRow(
            ChargeContext ctx, java.util.UUID jobId, Long policyId, int units) {
        PaygShadowCharge row = new PaygShadowCharge();
        row.setTeamId(ctx.ownerTeamId());
        row.setJobId(jobId);
        row.setPolicyId(policyId);
        row.setPaygUnits(units);
        // No legacy comparison yet — wired when the shadow path is connected to the legacy
        // CreditService in the follow-up PR. Until then, diff stays at 0.
        row.setLegacyCreditsCharged(0);
        row.setDiffPct(0);
        row.setStatus(ShadowChargeStatus.CHARGED);
        // PAYG analytics axis + caller surface — copied from ctx so the row stays self-describing
        // after processing_job is pruned. Never affects what Stripe meters (single flat meter).
        row.setBillingCategory(ctx.billingCategory());
        row.setJobSource(ctx.source());
        shadowRepository.save(row);
    }

    /**
     * First-step failure on a freshly-opened process: mimic a successful Stripe
     * meter_event_adjustment(cancel) by flipping the shadow row to {@link
     * ShadowChargeStatus#REFUNDED}, and close the process so a same-input retry can't lineage-join
     * into a refunded chain for free work.
     *
     * <p>Idempotent: re-invoking on an already-REFUNDED row or already-CLOSED process is a silent
     * no-op.
     */
    @Transactional
    public void markFirstStepFailed(UUID jobId, String refundReason) {
        Objects.requireNonNull(jobId, "jobId");
        LocalDateTime now = LocalDateTime.now();

        Optional<PaygShadowCharge> rowOpt = shadowRepository.findFirstByJobIdOrderByIdAsc(jobId);
        if (rowOpt.isEmpty()) {
            log.debug(
                    "markFirstStepFailed: no shadow row for job {} (PAYG not active for team?)",
                    jobId);
        } else {
            PaygShadowCharge row = rowOpt.get();
            if (row.getStatus() != ShadowChargeStatus.REFUNDED) {
                row.setStatus(ShadowChargeStatus.REFUNDED);
                row.setRefundedAt(now);
                row.setRefundReason(trimReason(refundReason));
                shadowRepository.save(row);
                // Compensate the live ledger DEBIT written at openProcess so the period spend
                // nets to zero for the failed work. Positive amount mirrors the negative debit;
                // same JOB reference ties the pair together. The idempotency guard above (only
                // on the CHARGED→REFUNDED transition) prevents double-credits on re-invocation.
                BillingCategory category = row.getBillingCategory();
                if (category != null && category != BillingCategory.BYPASSED) {
                    WalletLedgerEntry refund = new WalletLedgerEntry();
                    refund.setTeamId(row.getTeamId());
                    refund.setEntryType(LedgerEntryType.REFUND);
                    refund.setBucket(LedgerBucket.CYCLE);
                    refund.setAmountUnits(row.getPaygUnits());
                    refund.setReferenceType(ReferenceType.JOB);
                    refund.setReferenceId(jobId.toString());
                    refund.setPolicyId(row.getPolicyId());
                    refund.setBillingCategory(category);
                    ledgerRepository.save(refund);
                }
            }
        }

        ProcessingJob job = jobRepository.findById(jobId).orElse(null);
        if (job == null) {
            log.warn("markFirstStepFailed: no ProcessingJob with id {}", jobId);
            return;
        }
        if (job.getStatus() == JobStatus.OPEN) {
            job.setStatus(JobStatus.CLOSED);
            job.setClosedAt(now);
            jobRepository.save(job);
        }
    }

    /**
     * Closes a process and — for paid teams — pushes a Stripe meter event for the units captured on
     * the originating shadow row. Idempotent w.r.t. process state (delegates to {@link
     * JobService#close(UUID)}, which silently no-ops on an already-closed row).
     *
     * <p>The meter POST runs in an {@code afterCommit} hook so we only tell Stripe about work that
     * actually committed to our ledger (the customer's bill is authoritative — Stripe is the
     * downstream invoice). A failed POST does not roll back the close; the reconciliation backfill
     * (separate chunk) is the durability mechanism.
     *
     * <p>Skipped paths — no meter event fired:
     *
     * <ul>
     *   <li>{@code BillingCategory.BYPASSED} on the shadow row (manual UI tool — defensive; the
     *       interceptor never opens a process for these).
     *   <li>Refunded shadow row (the customer was credited; nothing to bill).
     *   <li>Team has no {@link PaygTeamExtensions#getStripeCustomerId() stripe_customer_id} (free
     *       tier; ledger entry suffices).
     *   <li>No shadow row at all (job opened outside the shadow path, e.g. legacy import).
     * </ul>
     */
    @Transactional
    public ProcessingJob close(UUID jobId) {
        Objects.requireNonNull(jobId, "jobId");
        ProcessingJob closed = jobService.close(jobId);

        // The afterCommit hook only fires if there's an active transaction (Spring's
        // @Transactional ensures that). If we're called outside one — e.g. a test using the raw
        // bean — fall through with a debug log: the close() above already happened in a
        // sub-transaction created by JobService, but the surrounding scope has no synchronization.
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            log.debug("close({}): no active synchronization; skipping meter POST", jobId);
            return closed;
        }

        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        try {
                            postMeterEventForClose(jobId);
                        } catch (RuntimeException e) {
                            // PaygMeterReportingService should already swallow; defence in depth so
                            // a thrown exception out of afterCommit doesn't leak past the
                            // synchronization boundary and bubble into the caller.
                            log.warn(
                                    "afterCommit meter post for job {} threw unexpectedly: {}",
                                    jobId,
                                    e.getMessage());
                        }
                    }
                });

        return closed;
    }

    private void postMeterEventForClose(UUID jobId) {
        Optional<PaygShadowCharge> rowOpt = shadowRepository.findFirstByJobIdOrderByIdAsc(jobId);
        if (rowOpt.isEmpty()) {
            // No shadow row → not a PAYG-tracked job; nothing to meter.
            return;
        }
        PaygShadowCharge row = rowOpt.get();
        if (row.getStatus() == ShadowChargeStatus.REFUNDED) {
            // Refunded rows are zero-net charges; do not emit a meter event.
            return;
        }
        BillingCategory category = row.getBillingCategory();
        if (category == null || category == BillingCategory.BYPASSED) {
            // Defensive: BYPASSED rows shouldn't exist (interceptor short-circuits before
            // openProcess), but tolerate if a future caller writes one.
            log.debug("close({}): shadow row category={} → no meter event", jobId, category);
            return;
        }
        Integer units = row.getPaygUnits();
        if (units == null || units <= 0) {
            return;
        }
        Long teamId = row.getTeamId();
        if (teamId == null) {
            return;
        }
        Optional<PaygTeamExtensions> ext = teamExtensionsRepository.findById(teamId);
        String stripeCustomerId = ext.map(PaygTeamExtensions::getStripeCustomerId).orElse(null);
        if (stripeCustomerId == null || stripeCustomerId.isBlank()) {
            // Free-tier team (no Stripe identity) — ledger entry is enough. When PR #6532 lands
            // this check tightens to ext.getPaygSubscriptionId() != null, but on this branch the
            // presence of stripe_customer_id is the established stand-in for "is subscribed."
            log.debug(
                    "close({}): team {} has no stripeCustomerId → free-tier, no meter event",
                    jobId,
                    teamId);
            return;
        }

        // The free allowance is app-side only — Stripe's Prices are plain per-unit with no free
        // tier — so withhold the free portion here. Period spend already includes this job's
        // DEBIT (written at openProcess, committed before this afterCommit hook runs).
        TeamBillingContext billing = teamBillingService.forTeam(teamId);
        long signedDebitSum =
                ledgerRepository.sumPeriodAmount(
                        teamId, LedgerEntryType.DEBIT, billing.periodStart(), billing.periodEnd());
        long periodSpend = signedDebitSum < 0 ? -signedDebitSum : 0L;
        int billableUnits = teamBillingService.billableUnitsForMeter(billing, periodSpend, units);
        if (billableUnits <= 0) {
            log.debug(
                    "close({}): {} units fall within the free allowance ({} of {}) → no meter"
                            + " event",
                    jobId,
                    units,
                    periodSpend,
                    billing.freeAllowanceUnits());
            return;
        }
        String idempotencyKey = "process:" + jobId + ":close";
        meterReportingService.recordUsage(
                teamId, stripeCustomerId, billableUnits, category, idempotencyKey);
    }

    /**
     * Mid-chain 5xx on a JOINED step: return the step slot. The {@code lastStepAt} timestamp stays
     * advanced (workflow window intentionally remains active for the next retry). No shadow-row
     * change — only OPENED-disposition calls wrote a row.
     *
     * <p>Defensive lower bound: never drives {@code stepCount} below 1 (which would imply we'd
     * decremented an already-decremented slot, or were called on a fresh process).
     */
    @Transactional
    public void decrementStepCount(UUID jobId) {
        Objects.requireNonNull(jobId, "jobId");
        ProcessingJob job = jobRepository.findById(jobId).orElse(null);
        if (job == null) {
            log.warn("decrementStepCount: no ProcessingJob with id {}", jobId);
            return;
        }
        int current = job.getStepCount() == null ? 0 : job.getStepCount();
        if (current <= 1) {
            log.debug(
                    "decrementStepCount: stepCount already at {} for job {}; no-op",
                    current,
                    jobId);
            return;
        }
        job.setStepCount(current - 1);
        jobRepository.save(job);
    }

    private static String trimReason(String reason) {
        if (reason == null) {
            return null;
        }
        return reason.length() > 128 ? reason.substring(0, 128) : reason;
    }
}
