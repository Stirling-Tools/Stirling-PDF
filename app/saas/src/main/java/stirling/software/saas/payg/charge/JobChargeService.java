package stirling.software.saas.payg.charge;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.docs.DocumentClassifier;
import stirling.software.saas.payg.docs.DocumentMetrics;
import stirling.software.saas.payg.job.JobContext;
import stirling.software.saas.payg.job.JobService;
import stirling.software.saas.payg.job.JoinOrOpenResult;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.policy.PricingPolicyService;
import stirling.software.saas.payg.repository.PaygShadowChargeRepository;
import stirling.software.saas.payg.shadow.PaygShadowCharge;

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

    public JobChargeService(
            JobService jobService,
            PricingPolicyService policyService,
            DocumentClassifier classifier,
            PaygShadowChargeRepository shadowRepository) {
        this.jobService = Objects.requireNonNull(jobService, "jobService");
        this.policyService = Objects.requireNonNull(policyService, "policyService");
        this.classifier = Objects.requireNonNull(classifier, "classifier");
        this.shadowRepository = Objects.requireNonNull(shadowRepository, "shadowRepository");
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

        return new ChargeOutcome(result.job().getId(), units, ChargeOutcome.Disposition.OPENED);
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
        DocumentMetrics metrics =
                multiparts.size() == 1
                        ? classifier.classify(multiparts.get(0), policy)
                        : classifier.classify(multiparts, policy);
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
        shadowRepository.save(row);
    }
}
