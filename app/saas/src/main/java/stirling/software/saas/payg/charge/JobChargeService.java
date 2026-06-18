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
 * <p>The {@code legacyCreditsCharged} field on the shadow row is set to {@code 0}: the legacy
 * credit engine has been removed, so there is no legacy debit to compare against and {@code
 * diffPct} stays {@code 0}. The shadow row captures the PAYG units only.
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

    public JobChargeService(
            JobService jobService,
            PricingPolicyService policyService,
            DocumentClassifier classifier,
            PaygShadowChargeRepository shadowRepository,
            ProcessingJobRepository jobRepository,
            PaygTeamExtensionsRepository teamExtensionsRepository,
            PaygMeterReportingService meterReportingService,
            WalletLedgerRepository ledgerRepository) {
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

        int freeUsed = consumeFreeGrant(ctx, units);
        recordShadowRow(ctx, result.job().getId(), policy.getId(), units, freeUsed);
        recordLedgerDebit(ctx, result.job().getId(), policy.getId(), units);

        return new ChargeOutcome(result.job().getId(), units, ChargeOutcome.Disposition.OPENED);
    }

    /**
     * Charge a fixed number of units for a billable action that isn't file/lineage-driven — e.g. an
     * AI Create session, billed once per document at session creation. Opens a standalone
     * bookkeeping job (no lineage inputs, so follow-up calls never lineage-join it), draws the
     * free-grant split, and writes the shadow + ledger rows exactly as {@link #openProcess} does,
     * then closes the job so the paid portion meters to Stripe via the same {@code afterCommit}
     * path and idempotency key ({@code process:<jobId>:close}).
     *
     * <p>Each call is independent: there is no join/dedup, so two sessions charge twice (correct —
     * each is a distinct document). The caller passes the unit count; the policy {@code
     * minChargeUnits} floor still applies. Must not be called for {@link BillingCategory#BYPASSED}.
     *
     * @return the bookkeeping job id (mostly useful for tests / tracing)
     */
    @Transactional
    public UUID chargeStandalone(ChargeContext ctx, int units) {
        Objects.requireNonNull(ctx, "ctx");
        if (ctx.billingCategory() == BillingCategory.BYPASSED) {
            throw new IllegalArgumentException("chargeStandalone must not be called for BYPASSED");
        }

        PricingPolicy policy = policyService.getEffectivePolicy(ctx.ownerTeamId());
        int chargeUnits = Math.max(units, policy.getMinChargeUnits());
        int stepLimit = resolveStepLimit(policy, ctx.source());

        JobContext jobCtx =
                new JobContext(
                        ctx.ownerUserId(),
                        ctx.ownerTeamId(),
                        ctx.source(),
                        ctx.processType(),
                        policy.getId(),
                        stepLimit);
        ProcessingJob job = jobService.open(jobCtx, chargeUnits);

        int freeUsed = consumeFreeGrant(ctx, chargeUnits);
        recordShadowRow(ctx, job.getId(), policy.getId(), chargeUnits, freeUsed);
        recordLedgerDebit(ctx, job.getId(), policy.getId(), chargeUnits);

        // Close immediately — nothing will lineage-join a standalone job — so the paid portion
        // meters via the same afterCommit hook + idempotency key as a normal process completion.
        close(job.getId());
        return job.getId();
    }

    /**
     * Draw this job's free portion from the team's one-time lifetime grant, atomically, and return
     * the units taken (0..{@code units}); the remainder is the paid portion that will be metered to
     * Stripe. Runs inside {@code openProcess}'s transaction with a pessimistic row lock so
     * concurrent same-team charges split the grant exactly — no two jobs can both claim the last
     * free unit. The grant is a soft floor: it never goes below 0, and the single job that crosses
     * the boundary takes whatever's left (its remaining units bill). Skipped for non-billable /
     * team-less calls (BYPASSED never reaches openProcess; guarded defensively).
     */
    private int consumeFreeGrant(ChargeContext ctx, int units) {
        BillingCategory category = ctx.billingCategory();
        if (category == null || category == BillingCategory.BYPASSED || ctx.ownerTeamId() == null) {
            return 0;
        }
        Optional<PaygTeamExtensions> extOpt =
                teamExtensionsRepository.findByIdForUpdate(ctx.ownerTeamId());
        if (extOpt.isEmpty()) {
            return 0;
        }
        PaygTeamExtensions ext = extOpt.get();
        long remaining = ext.getFreeUnitsRemaining() == null ? 0L : ext.getFreeUnitsRemaining();
        int freeUsed = (int) Math.min(units, Math.max(0L, remaining));
        if (freeUsed > 0) {
            ext.setFreeUnitsRemaining(remaining - freeUsed);
            teamExtensionsRepository.save(ext);
        }
        return freeUsed;
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
            ChargeContext ctx,
            java.util.UUID jobId,
            Long policyId,
            int units,
            int freeUnitsConsumed) {
        PaygShadowCharge row = new PaygShadowCharge();
        row.setTeamId(ctx.ownerTeamId());
        row.setJobId(jobId);
        row.setPolicyId(policyId);
        row.setPaygUnits(units);
        // Free-vs-paid split fixed at charge time: paid (metered) = paygUnits - freeUnitsConsumed,
        // and a refund restores freeUnitsConsumed to the team's grant.
        row.setFreeUnitsConsumed(freeUnitsConsumed);
        // No legacy comparison: the legacy credit engine has been removed, so diff stays at 0.
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
                    // Hand back the free units this job consumed (first-step failures are
                    // pre-meter, so nothing was billed to Stripe — only the grant moved). Exactly
                    // what was taken at charge time, so the counter can't drift above the grant.
                    int freeConsumed =
                            row.getFreeUnitsConsumed() == null ? 0 : row.getFreeUnitsConsumed();
                    if (freeConsumed > 0 && row.getTeamId() != null) {
                        teamExtensionsRepository.restoreFreeUnits(row.getTeamId(), freeConsumed);
                    }
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
     * Closes a process and — as a fallback — meters its usage. The primary meter trigger is the
     * charge interceptor's {@code afterCompletion} on a successful request (see {@link
     * #meterJobUsage(UUID)}); this close-time meter exists to catch processes that were never
     * cleanly completed (request thread died before {@code afterCompletion}) and are swept up later
     * by {@code StaleJobCloser}. The deterministic idempotency key means a job already metered at
     * completion is deduped here at Stripe, so the two paths never double-bill.
     *
     * <p>Idempotent w.r.t. process state (delegates to {@link JobService#close(UUID)}, which
     * silently no-ops on an already-closed row). The meter POST runs in an {@code afterCommit} hook
     * so a failed POST does not roll back the close; the reconciliation backfill (separate chunk)
     * is the durability mechanism.
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
                            meterJobUsage(jobId);
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

    /**
     * Post this job's billable usage to Stripe. The primary caller is the charge interceptor's
     * {@code afterCompletion} on a successful OPENED request — i.e. the moment the work finishes —
     * so the meter moves promptly. {@link #close(UUID)} also calls this from its {@code
     * afterCommit} hook as the fallback for processes that were never cleanly completed (e.g. the
     * request thread died); the deterministic idempotency key ({@code process:<id>:close}) makes
     * the two paths dedup at Stripe, so a job metered at completion isn't billed again when it's
     * later stale-closed.
     *
     * <p>Safe to call outside a transaction: it only reads (the job's openProcess DEBIT is already
     * committed by the time either caller runs) and the POST is best-effort. Never throws — see
     * {@link PaygMeterReportingService}.
     *
     * <p>Skips: no shadow row (not PAYG-tracked), REFUNDED row (first-step failure — never billed),
     * BYPASSED/uncategorised, zero units, free-tier team (no Stripe customer), or usage still
     * within the app-side free allowance.
     */
    public void meterJobUsage(UUID jobId) {
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
        PaygTeamExtensions ext = teamExtensionsRepository.findById(teamId).orElse(null);
        if (ext == null) {
            return;
        }
        // payg_subscription_id is the single switch that says "this team is billed" (see
        // PaygTeamExtensions). Gate on it directly now that V14 ships the column: a team with a
        // Stripe customer but no live subscription — e.g. the brief window after checkout but
        // before the subscription-created webhook lands — must not post meter events against a
        // subscription that doesn't exist. A job finishing in that window is still metered later
        // via the stale-close fallback, once the subscription has landed (same idempotency key).
        String subscriptionId = ext.getPaygSubscriptionId();
        if (subscriptionId == null || subscriptionId.isBlank()) {
            log.debug(
                    "close({}): team {} has no active subscription → no meter event",
                    jobId,
                    teamId);
            return;
        }
        String stripeCustomerId = ext.getStripeCustomerId();
        if (stripeCustomerId == null || stripeCustomerId.isBlank()) {
            // Subscribed but no customer id is a data inconsistency — we can't address the event.
            log.warn(
                    "close({}): team {} has a subscription but no stripeCustomerId → cannot meter",
                    jobId,
                    teamId);
            return;
        }

        // Paid portion = units beyond the team's one-time free grant, fixed at charge time. The
        // free grant is app-side only (Stripe's Prices are plain per-unit, no free tier), so the
        // free units were already withheld when this row's free_units_consumed was set.
        int freeConsumed = row.getFreeUnitsConsumed() == null ? 0 : row.getFreeUnitsConsumed();
        int paidUnits = units - freeConsumed;
        if (paidUnits <= 0) {
            log.debug(
                    "close({}): all {} units came from the free grant → no meter event",
                    jobId,
                    units);
            return;
        }
        String idempotencyKey = "process:" + jobId + ":close";
        meterReportingService.recordUsage(
                teamId, stripeCustomerId, paidUnits, category, idempotencyKey, jobId);
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
