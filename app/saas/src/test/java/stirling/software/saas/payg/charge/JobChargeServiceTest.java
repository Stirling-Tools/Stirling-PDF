package stirling.software.saas.payg.charge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

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
import stirling.software.saas.payg.model.ProcessType;
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
 * Exercises {@link JobChargeService} as an orchestrator: policy lookup, step-limit resolution,
 * delegate to {@code JobService}, write shadow row when OPENED, skip everything when JOINED.
 */
class JobChargeServiceTest {

    private JobService jobService;
    private PricingPolicyService policyService;
    private DocumentClassifier classifier;
    private PaygShadowChargeRepository shadowRepo;
    private ProcessingJobRepository jobRepo;
    private PaygTeamExtensionsRepository teamExtRepo;
    private PaygMeterReportingService meterReporter;
    private WalletLedgerRepository ledgerRepo;
    private JobChargeService service;

    @BeforeEach
    void setUp() {
        jobService = Mockito.mock(JobService.class);
        policyService = Mockito.mock(PricingPolicyService.class);
        classifier = Mockito.mock(DocumentClassifier.class);
        shadowRepo = Mockito.mock(PaygShadowChargeRepository.class);
        jobRepo = Mockito.mock(ProcessingJobRepository.class);
        teamExtRepo = Mockito.mock(PaygTeamExtensionsRepository.class);
        meterReporter = Mockito.mock(PaygMeterReportingService.class);
        ledgerRepo = Mockito.mock(WalletLedgerRepository.class);
        // findByIdForUpdate defaults to Optional.empty() (Mockito) → no free grant consumed unless
        // a test stubs the sidecar row. The free split is decided at openProcess time now, not at
        // close, so the meter tests just set free_units_consumed on the shadow row directly.
        service =
                new JobChargeService(
                        jobService,
                        policyService,
                        classifier,
                        shadowRepo,
                        jobRepo,
                        teamExtRepo,
                        meterReporter,
                        ledgerRepo);
    }

    @AfterEach
    void tearDown() {
        // Defensive: a previous test could have left a fake synchronization registered. Clearing
        // ensures isolation when tests run in any order.
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clear();
        }
    }

    @Test
    void openProcess_joinedDisposition_skipsClassifierAndShadowWrite(@TempDir Path tmp)
            throws IOException {
        // Setup: policy + a JOINED result.
        PricingPolicy policy = stubPolicy(/*minCharge*/ 1, Map.of(JobSource.WEB, 10));
        when(policyService.getEffectivePolicy(100L)).thenReturn(policy);
        ProcessingJob joinedJob = openJob(UUID.randomUUID());
        when(jobService.joinOrOpen(any(JobContext.class), anyList()))
                .thenReturn(new JoinOrOpenResult(joinedJob, JoinOrOpenResult.Disposition.JOINED));

        JobInput in = jobInput(tmp, "in.pdf", "application/pdf");

        ChargeOutcome out =
                service.openProcess(
                        new ChargeContext(
                                42L,
                                100L,
                                JobSource.WEB,
                                ProcessType.SINGLE_TOOL,
                                BillingCategory.API),
                        List.of(in));

        assertThat(out.disposition()).isEqualTo(ChargeOutcome.Disposition.JOINED);
        assertThat(out.processId()).isEqualTo(joinedJob.getId());
        assertThat(out.units()).isZero();
        verify(classifier, never()).classify(any(MultipartFile.class), any());
        verify(classifier, never()).classify(anyList(), any());
        verify(shadowRepo, never()).save(any());
        verify(ledgerRepo, never()).save(any());
    }

    @Test
    void openProcess_openedSingleFile_classifiesAndWritesShadowRow(@TempDir Path tmp)
            throws IOException {
        PricingPolicy policy = stubPolicy(/*minCharge*/ 1, Map.of(JobSource.WEB, 10));
        when(policyService.getEffectivePolicy(100L)).thenReturn(policy);
        ProcessingJob newJob = openJob(UUID.randomUUID());
        when(jobService.joinOrOpen(any(JobContext.class), anyList()))
                .thenReturn(new JoinOrOpenResult(newJob, JoinOrOpenResult.Disposition.OPENED));

        JobInput in = jobInput(tmp, "in.pdf", "application/pdf");
        when(classifier.classify(any(MultipartFile.class), any(Path.class), eq(policy)))
                .thenReturn(new DocumentMetrics(50, 1024L, "application/pdf", 4));

        ChargeOutcome out =
                service.openProcess(
                        new ChargeContext(
                                42L,
                                100L,
                                JobSource.WEB,
                                ProcessType.SINGLE_TOOL,
                                BillingCategory.API),
                        List.of(in));

        assertThat(out.disposition()).isEqualTo(ChargeOutcome.Disposition.OPENED);
        assertThat(out.units()).isEqualTo(4);
        // Single-file path called single-file classifier overload (with Path), not the list one.
        verify(classifier, times(1))
                .classify(any(MultipartFile.class), any(Path.class), eq(policy));
        verify(classifier, never()).classify(anyList(), anyList(), eq(policy));

        ArgumentCaptor<PaygShadowCharge> captor = ArgumentCaptor.forClass(PaygShadowCharge.class);
        verify(shadowRepo).save(captor.capture());
        PaygShadowCharge row = captor.getValue();
        assertThat(row.getTeamId()).isEqualTo(100L);
        assertThat(row.getJobId()).isEqualTo(newJob.getId());
        assertThat(row.getPolicyId()).isEqualTo(policy.getId());
        assertThat(row.getPaygUnits()).isEqualTo(4);
        // Legacy comparison removed with the legacy credit engine — always zeroed.
        assertThat(row.getLegacyCreditsCharged()).isZero();
        assertThat(row.getDiffPct()).isZero();
        // PAYG analytics axis: billing_category + job_source are copied from the context so the
        // row stays self-describing after processing_job rows are pruned.
        assertThat(row.getBillingCategory()).isEqualTo(BillingCategory.API);
        assertThat(row.getJobSource()).isEqualTo(JobSource.WEB);

        // Job entity carries the classified docUnits so close-time receipts can render correctly.
        assertThat(newJob.getDocUnits()).isEqualTo(4);

        // Live ledger DEBIT mirrors the shadow row: same units, stored NEGATIVE per the
        // wallet_ledger sign convention, tied back to the job via reference.
        ArgumentCaptor<WalletLedgerEntry> ledgerCaptor =
                ArgumentCaptor.forClass(WalletLedgerEntry.class);
        verify(ledgerRepo).save(ledgerCaptor.capture());
        WalletLedgerEntry debit = ledgerCaptor.getValue();
        assertThat(debit.getTeamId()).isEqualTo(100L);
        assertThat(debit.getActorUserId()).isEqualTo(42L);
        assertThat(debit.getEntryType()).isEqualTo(LedgerEntryType.DEBIT);
        assertThat(debit.getBucket()).isEqualTo(LedgerBucket.CYCLE);
        assertThat(debit.getAmountUnits()).isEqualTo(-4);
        assertThat(debit.getReferenceType()).isEqualTo(ReferenceType.JOB);
        assertThat(debit.getReferenceId()).isEqualTo(newJob.getId().toString());
        assertThat(debit.getPolicyId()).isEqualTo(policy.getId());
        assertThat(debit.getBillingCategory()).isEqualTo(BillingCategory.API);
    }

    @Test
    void openProcess_bypassedCategory_writesShadowRowButNoLedgerDebit(@TempDir Path tmp)
            throws IOException {
        // Manual UI work is never billed: the shadow row still lands (comparison audit trail)
        // but the live wallet_ledger must stay untouched.
        PricingPolicy policy = stubPolicy(/*minCharge*/ 1, Map.of(JobSource.WEB, 10));
        when(policyService.getEffectivePolicy(100L)).thenReturn(policy);
        ProcessingJob newJob = openJob(UUID.randomUUID());
        when(jobService.joinOrOpen(any(JobContext.class), anyList()))
                .thenReturn(new JoinOrOpenResult(newJob, JoinOrOpenResult.Disposition.OPENED));
        when(classifier.classify(any(MultipartFile.class), any(Path.class), eq(policy)))
                .thenReturn(new DocumentMetrics(1, 100L, "application/pdf", 1));

        service.openProcess(
                new ChargeContext(
                        42L,
                        100L,
                        JobSource.WEB,
                        ProcessType.SINGLE_TOOL,
                        BillingCategory.BYPASSED),
                List.of(jobInput(tmp, "in.pdf", "application/pdf")));

        verify(shadowRepo).save(any(PaygShadowCharge.class));
        verify(ledgerRepo, never()).save(any());
    }

    @Test
    void openProcess_openedAutomationContext_writesShadowRowWithAutomationCategory(
            @TempDir Path tmp) throws IOException {
        PricingPolicy policy =
                stubPolicy(/*minCharge*/ 1, Map.of(JobSource.WEB, 10, JobSource.PIPELINE, 20));
        when(policyService.getEffectivePolicy(100L)).thenReturn(policy);
        ProcessingJob newJob = openJob(UUID.randomUUID());
        when(jobService.joinOrOpen(any(JobContext.class), anyList()))
                .thenReturn(new JoinOrOpenResult(newJob, JoinOrOpenResult.Disposition.OPENED));
        when(classifier.classify(any(MultipartFile.class), any(Path.class), eq(policy)))
                .thenReturn(new DocumentMetrics(1, 100L, "application/pdf", 1));

        service.openProcess(
                new ChargeContext(
                        42L,
                        100L,
                        JobSource.PIPELINE,
                        ProcessType.AUTOMATION,
                        BillingCategory.AUTOMATION),
                List.of(jobInput(tmp, "in.pdf", "application/pdf")));

        ArgumentCaptor<PaygShadowCharge> captor = ArgumentCaptor.forClass(PaygShadowCharge.class);
        verify(shadowRepo).save(captor.capture());
        assertThat(captor.getValue().getBillingCategory()).isEqualTo(BillingCategory.AUTOMATION);
        assertThat(captor.getValue().getJobSource()).isEqualTo(JobSource.PIPELINE);
    }

    @Test
    void openProcess_openedMultiFile_usesListClassifier(@TempDir Path tmp) throws IOException {
        PricingPolicy policy = stubPolicy(/*minCharge*/ 1, Map.of(JobSource.WEB, 10));
        when(policyService.getEffectivePolicy(100L)).thenReturn(policy);
        ProcessingJob newJob = openJob(UUID.randomUUID());
        when(jobService.joinOrOpen(any(JobContext.class), anyList()))
                .thenReturn(new JoinOrOpenResult(newJob, JoinOrOpenResult.Disposition.OPENED));

        JobInput a = jobInput(tmp, "a.pdf", "application/pdf");
        JobInput b = jobInput(tmp, "b.pdf", "application/pdf");
        when(classifier.classify(anyList(), anyList(), eq(policy)))
                .thenReturn(new DocumentMetrics(100, 2048L, "application/pdf", 7));

        ChargeOutcome out =
                service.openProcess(
                        new ChargeContext(
                                42L,
                                100L,
                                JobSource.WEB,
                                ProcessType.AUTOMATION,
                                BillingCategory.AUTOMATION),
                        List.of(a, b));

        assertThat(out.units()).isEqualTo(7);
        verify(classifier, never()).classify(any(MultipartFile.class), any(Path.class), any());
        verify(classifier, times(1)).classify(anyList(), anyList(), eq(policy));
    }

    @Test
    void openProcess_minChargeUnitsFloorApplied(@TempDir Path tmp) throws IOException {
        // Policy says min 5 units. Classifier returns 2. Expect 5 to be charged.
        PricingPolicy policy = stubPolicy(/*minCharge*/ 5, Map.of(JobSource.WEB, 10));
        when(policyService.getEffectivePolicy(100L)).thenReturn(policy);
        ProcessingJob newJob = openJob(UUID.randomUUID());
        when(jobService.joinOrOpen(any(JobContext.class), anyList()))
                .thenReturn(new JoinOrOpenResult(newJob, JoinOrOpenResult.Disposition.OPENED));
        when(classifier.classify(any(MultipartFile.class), any(Path.class), eq(policy)))
                .thenReturn(new DocumentMetrics(10, 1024L, "application/pdf", 2));

        ChargeOutcome out =
                service.openProcess(
                        new ChargeContext(
                                42L,
                                100L,
                                JobSource.WEB,
                                ProcessType.SINGLE_TOOL,
                                BillingCategory.API),
                        List.of(jobInput(tmp, "in.pdf", "application/pdf")));

        assertThat(out.units()).isEqualTo(5);
    }

    @Test
    void openProcess_drawsFreeGrant_storesSplitAndDecrementsCounter(@TempDir Path tmp)
            throws IOException {
        // Team has 10 free units left; a 4-unit job draws all 4 from the grant. The shadow row
        // records free_units_consumed = 4 (so nothing meters) and the counter drops to 6.
        PricingPolicy policy = stubPolicy(1, Map.of(JobSource.WEB, 10));
        when(policyService.getEffectivePolicy(100L)).thenReturn(policy);
        ProcessingJob newJob = openJob(UUID.randomUUID());
        when(jobService.joinOrOpen(any(JobContext.class), anyList()))
                .thenReturn(new JoinOrOpenResult(newJob, JoinOrOpenResult.Disposition.OPENED));
        when(classifier.classify(any(MultipartFile.class), any(Path.class), eq(policy)))
                .thenReturn(new DocumentMetrics(50, 1024L, "application/pdf", 4));

        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(100L);
        ext.setFreeUnitsRemaining(10L);
        when(teamExtRepo.findByIdForUpdate(100L)).thenReturn(Optional.of(ext));

        service.openProcess(
                new ChargeContext(
                        42L, 100L, JobSource.WEB, ProcessType.SINGLE_TOOL, BillingCategory.API),
                List.of(jobInput(tmp, "in.pdf", "application/pdf")));

        ArgumentCaptor<PaygShadowCharge> captor = ArgumentCaptor.forClass(PaygShadowCharge.class);
        verify(shadowRepo).save(captor.capture());
        assertThat(captor.getValue().getPaygUnits()).isEqualTo(4);
        assertThat(captor.getValue().getFreeUnitsConsumed()).isEqualTo(4);
        // Counter decremented in-place and persisted.
        assertThat(ext.getFreeUnitsRemaining()).isEqualTo(6L);
        verify(teamExtRepo).save(ext);
    }

    @Test
    void openProcess_grantStraddle_drawsRemainderFreeAndBillsTheRest(@TempDir Path tmp)
            throws IOException {
        // Only 3 free units left; a 10-unit job takes the 3 (counter → 0) and the other 7 bill.
        PricingPolicy policy = stubPolicy(1, Map.of(JobSource.WEB, 10));
        when(policyService.getEffectivePolicy(100L)).thenReturn(policy);
        ProcessingJob newJob = openJob(UUID.randomUUID());
        when(jobService.joinOrOpen(any(JobContext.class), anyList()))
                .thenReturn(new JoinOrOpenResult(newJob, JoinOrOpenResult.Disposition.OPENED));
        when(classifier.classify(any(MultipartFile.class), any(Path.class), eq(policy)))
                .thenReturn(new DocumentMetrics(50, 1024L, "application/pdf", 10));

        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(100L);
        ext.setFreeUnitsRemaining(3L);
        when(teamExtRepo.findByIdForUpdate(100L)).thenReturn(Optional.of(ext));

        service.openProcess(
                new ChargeContext(
                        42L, 100L, JobSource.WEB, ProcessType.SINGLE_TOOL, BillingCategory.API),
                List.of(jobInput(tmp, "in.pdf", "application/pdf")));

        ArgumentCaptor<PaygShadowCharge> captor = ArgumentCaptor.forClass(PaygShadowCharge.class);
        verify(shadowRepo).save(captor.capture());
        assertThat(captor.getValue().getPaygUnits()).isEqualTo(10);
        assertThat(captor.getValue().getFreeUnitsConsumed()).isEqualTo(3);
        assertThat(ext.getFreeUnitsRemaining()).isZero();
        verify(teamExtRepo).save(ext);
    }

    @Test
    void openProcess_exhaustedGrant_storesZeroFreeAndLeavesCounterUntouched(@TempDir Path tmp)
            throws IOException {
        // Grant already at 0 → nothing free, full units bill, counter not re-saved.
        PricingPolicy policy = stubPolicy(1, Map.of(JobSource.WEB, 10));
        when(policyService.getEffectivePolicy(100L)).thenReturn(policy);
        ProcessingJob newJob = openJob(UUID.randomUUID());
        when(jobService.joinOrOpen(any(JobContext.class), anyList()))
                .thenReturn(new JoinOrOpenResult(newJob, JoinOrOpenResult.Disposition.OPENED));
        when(classifier.classify(any(MultipartFile.class), any(Path.class), eq(policy)))
                .thenReturn(new DocumentMetrics(50, 1024L, "application/pdf", 5));

        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(100L);
        ext.setFreeUnitsRemaining(0L);
        when(teamExtRepo.findByIdForUpdate(100L)).thenReturn(Optional.of(ext));

        service.openProcess(
                new ChargeContext(
                        42L, 100L, JobSource.WEB, ProcessType.SINGLE_TOOL, BillingCategory.API),
                List.of(jobInput(tmp, "in.pdf", "application/pdf")));

        ArgumentCaptor<PaygShadowCharge> captor = ArgumentCaptor.forClass(PaygShadowCharge.class);
        verify(shadowRepo).save(captor.capture());
        assertThat(captor.getValue().getFreeUnitsConsumed()).isZero();
        verify(teamExtRepo, never()).save(any());
    }

    @Test
    void openProcess_resolvesStepLimitFromPolicy_perJobSource(@TempDir Path tmp)
            throws IOException {
        // Different limits per source: WEB=10, PIPELINE=20. Verify the right one is passed.
        PricingPolicy policy =
                stubPolicy(/*minCharge*/ 1, Map.of(JobSource.WEB, 10, JobSource.PIPELINE, 20));
        when(policyService.getEffectivePolicy(100L)).thenReturn(policy);
        ProcessingJob newJob = openJob(UUID.randomUUID());
        when(jobService.joinOrOpen(any(JobContext.class), anyList()))
                .thenReturn(new JoinOrOpenResult(newJob, JoinOrOpenResult.Disposition.OPENED));
        when(classifier.classify(any(MultipartFile.class), any(Path.class), eq(policy)))
                .thenReturn(new DocumentMetrics(1, 100L, "application/pdf", 1));

        service.openProcess(
                new ChargeContext(
                        42L,
                        100L,
                        JobSource.PIPELINE,
                        ProcessType.AUTOMATION,
                        BillingCategory.AUTOMATION),
                List.of(jobInput(tmp, "in.pdf", "application/pdf")));

        ArgumentCaptor<JobContext> ctxCaptor = ArgumentCaptor.forClass(JobContext.class);
        verify(jobService).joinOrOpen(ctxCaptor.capture(), anyList());
        assertThat(ctxCaptor.getValue().stepLimit()).isEqualTo(20);
        assertThat(ctxCaptor.getValue().source()).isEqualTo(JobSource.PIPELINE);
        assertThat(ctxCaptor.getValue().policyId()).isEqualTo(policy.getId());
    }

    @Test
    void openProcess_missingStepLimitForSource_fallsBackToConservativeDefault(@TempDir Path tmp)
            throws IOException {
        // Policy has no entry for DESKTOP_APP — should fall through to the conservative default
        // (10) rather than throwing or treating as unlimited.
        PricingPolicy policy = stubPolicy(/*minCharge*/ 1, Map.of(JobSource.WEB, 10));
        when(policyService.getEffectivePolicy(100L)).thenReturn(policy);
        ProcessingJob newJob = openJob(UUID.randomUUID());
        when(jobService.joinOrOpen(any(JobContext.class), anyList()))
                .thenReturn(new JoinOrOpenResult(newJob, JoinOrOpenResult.Disposition.OPENED));
        when(classifier.classify(any(MultipartFile.class), any(Path.class), eq(policy)))
                .thenReturn(new DocumentMetrics(1, 100L, "application/pdf", 1));

        service.openProcess(
                new ChargeContext(
                        42L,
                        100L,
                        JobSource.DESKTOP_APP,
                        ProcessType.SINGLE_TOOL,
                        BillingCategory.API),
                List.of(jobInput(tmp, "in.pdf", "application/pdf")));

        ArgumentCaptor<JobContext> ctxCaptor = ArgumentCaptor.forClass(JobContext.class);
        verify(jobService).joinOrOpen(ctxCaptor.capture(), anyList());
        assertThat(ctxCaptor.getValue().stepLimit()).isEqualTo(10);
    }

    @Test
    void openProcess_emptyInputs_throws() {
        assertThatThrownBy(
                        () ->
                                service.openProcess(
                                        new ChargeContext(
                                                42L,
                                                100L,
                                                JobSource.WEB,
                                                ProcessType.SINGLE_TOOL,
                                                BillingCategory.API),
                                        List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("inputs must not be empty");
    }

    @Test
    void markFirstStepFailed_flipsShadowRowAndClosesProcess() {
        UUID jobId = UUID.randomUUID();
        PaygShadowCharge row = chargedShadowRow(jobId, 100L, 4, BillingCategory.API);
        row.setPolicyId(7L);
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(java.util.Optional.of(row));
        ProcessingJob job = openJob(jobId);
        when(jobRepo.findById(jobId)).thenReturn(java.util.Optional.of(job));

        service.markFirstStepFailed(jobId, "first-step-5xx:503");

        assertThat(row.getStatus()).isEqualTo(ShadowChargeStatus.REFUNDED);
        assertThat(row.getRefundedAt()).isNotNull();
        assertThat(row.getRefundReason()).isEqualTo("first-step-5xx:503");
        assertThat(job.getStatus()).isEqualTo(JobStatus.CLOSED);
        assertThat(job.getClosedAt()).isNotNull();
        verify(shadowRepo).save(row);
        verify(jobRepo).save(job);

        // Compensating REFUND entry: positive amount mirroring the openProcess debit, same JOB
        // reference so the pair nets to zero for the period.
        ArgumentCaptor<WalletLedgerEntry> ledgerCaptor =
                ArgumentCaptor.forClass(WalletLedgerEntry.class);
        verify(ledgerRepo).save(ledgerCaptor.capture());
        WalletLedgerEntry refund = ledgerCaptor.getValue();
        assertThat(refund.getTeamId()).isEqualTo(100L);
        assertThat(refund.getEntryType()).isEqualTo(LedgerEntryType.REFUND);
        assertThat(refund.getBucket()).isEqualTo(LedgerBucket.CYCLE);
        assertThat(refund.getAmountUnits()).isEqualTo(4);
        assertThat(refund.getReferenceType()).isEqualTo(ReferenceType.JOB);
        assertThat(refund.getReferenceId()).isEqualTo(jobId.toString());
        assertThat(refund.getPolicyId()).isEqualTo(7L);
        assertThat(refund.getBillingCategory()).isEqualTo(BillingCategory.API);
        // This row consumed no free units, so the grant counter is left alone.
        verify(teamExtRepo, never()).restoreFreeUnits(eq(100L), Mockito.anyLong());
    }

    @Test
    void markFirstStepFailed_withFreeConsumed_restoresGrantToCounter() {
        // A first-step failure is pre-meter: nothing billed to Stripe, but the grant moved at
        // charge time. The refund must hand exactly those free units back to the team's counter.
        UUID jobId = UUID.randomUUID();
        PaygShadowCharge row = chargedShadowRow(jobId, 100L, 10, 3, BillingCategory.API);
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(Optional.of(row));
        when(jobRepo.findById(jobId)).thenReturn(Optional.of(openJob(jobId)));

        service.markFirstStepFailed(jobId, "first-step-5xx:503");

        verify(teamExtRepo).restoreFreeUnits(100L, 3L);
    }

    @Test
    void markFirstStepFailed_alreadyRefunded_isNoOp() {
        UUID jobId = UUID.randomUUID();
        PaygShadowCharge row = new PaygShadowCharge();
        row.setJobId(jobId);
        row.setStatus(ShadowChargeStatus.REFUNDED);
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(java.util.Optional.of(row));
        ProcessingJob job = openJob(jobId);
        job.setStatus(JobStatus.CLOSED);
        when(jobRepo.findById(jobId)).thenReturn(java.util.Optional.of(job));

        service.markFirstStepFailed(jobId, "first-step-5xx:500");

        verify(shadowRepo, never()).save(any());
        verify(jobRepo, never()).save(any());
        // No double-credit: the REFUND ledger entry only accompanies the CHARGED→REFUNDED flip.
        verify(ledgerRepo, never()).save(any());
    }

    @Test
    void markFirstStepFailed_noShadowRow_stillClosesProcess() {
        UUID jobId = UUID.randomUUID();
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(java.util.Optional.empty());
        ProcessingJob job = openJob(jobId);
        when(jobRepo.findById(jobId)).thenReturn(java.util.Optional.of(job));

        service.markFirstStepFailed(jobId, "first-step-5xx:503");

        assertThat(job.getStatus()).isEqualTo(JobStatus.CLOSED);
        verify(jobRepo).save(job);
    }

    @Test
    void markFirstStepFailed_trimsLongRefundReason() {
        UUID jobId = UUID.randomUUID();
        PaygShadowCharge row = new PaygShadowCharge();
        row.setStatus(ShadowChargeStatus.CHARGED);
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(java.util.Optional.of(row));
        when(jobRepo.findById(jobId)).thenReturn(java.util.Optional.empty());

        String oversized = "x".repeat(200);
        service.markFirstStepFailed(jobId, oversized);

        assertThat(row.getRefundReason()).hasSize(128);
    }

    @Test
    void decrementStepCount_decrementsByOne() {
        UUID jobId = UUID.randomUUID();
        ProcessingJob job = openJob(jobId);
        job.setStepCount(3);
        when(jobRepo.findById(jobId)).thenReturn(java.util.Optional.of(job));

        service.decrementStepCount(jobId);

        assertThat(job.getStepCount()).isEqualTo(2);
        verify(jobRepo).save(job);
    }

    @Test
    void decrementStepCount_floorAtOne_neverDrivesNegative() {
        UUID jobId = UUID.randomUUID();
        ProcessingJob job = openJob(jobId);
        job.setStepCount(1);
        when(jobRepo.findById(jobId)).thenReturn(java.util.Optional.of(job));

        service.decrementStepCount(jobId);

        assertThat(job.getStepCount()).isEqualTo(1);
        verify(jobRepo, never()).save(any());
    }

    @Test
    void decrementStepCount_missingJob_isNoOp() {
        UUID jobId = UUID.randomUUID();
        when(jobRepo.findById(jobId)).thenReturn(java.util.Optional.empty());
        service.decrementStepCount(jobId); // must not throw
        verify(jobRepo, never()).save(any());
    }

    // --- close() — meter reporting in afterCommit -----------------------------------------------

    @Test
    void close_subscribedTeam_postsMeterEventAfterCommit() {
        UUID jobId = UUID.randomUUID();
        ProcessingJob job = openJob(jobId);
        when(jobService.close(jobId)).thenReturn(job);

        PaygShadowCharge row = chargedShadowRow(jobId, 100L, 4, BillingCategory.API);
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(Optional.of(row));

        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(100L);
        ext.setStripeCustomerId("cus_subscribed");
        ext.setPaygSubscriptionId("sub_test");
        when(teamExtRepo.findById(100L)).thenReturn(Optional.of(ext));
        // Row consumed no free units (free_units_consumed = 0) → all 4 are paid and meter.

        withTransactionSynchronization(
                () -> {
                    service.close(jobId);
                    Mockito.verifyNoInteractions(meterReporter);
                });

        // afterCommit ran on tearDown of withTransactionSynchronization → meter posted now.
        verify(meterReporter)
                .recordUsage(
                        100L,
                        "cus_subscribed",
                        4,
                        BillingCategory.API,
                        "process:" + jobId + ":close",
                        jobId);
    }

    @Test
    void close_fullyFreeJob_doesNotPostMeterEvent() {
        // The free-vs-paid split is fixed at charge time. A job whose 4 units all came from the
        // one-time grant (free_units_consumed = 4) has nothing left to meter; the ledger DEBIT
        // alone records the usage.
        UUID jobId = UUID.randomUUID();
        ProcessingJob job = openJob(jobId);
        when(jobService.close(jobId)).thenReturn(job);

        PaygShadowCharge row = chargedShadowRow(jobId, 100L, 4, 4, BillingCategory.API);
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(Optional.of(row));

        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(100L);
        ext.setStripeCustomerId("cus_subscribed");
        ext.setPaygSubscriptionId("sub_test");
        when(teamExtRepo.findById(100L)).thenReturn(Optional.of(ext));

        withTransactionSynchronization(() -> service.close(jobId));

        Mockito.verifyNoInteractions(meterReporter);
    }

    @Test
    void close_partiallyFreeJob_metersOnlyThePaidPortion() {
        // 20-unit job that drew 10 from the remaining grant at charge time (free_units_consumed =
        // 10) → 10 paid units meter to Stripe.
        UUID jobId = UUID.randomUUID();
        ProcessingJob job = openJob(jobId);
        when(jobService.close(jobId)).thenReturn(job);

        PaygShadowCharge row = chargedShadowRow(jobId, 100L, 20, 10, BillingCategory.AUTOMATION);
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(Optional.of(row));

        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(100L);
        ext.setStripeCustomerId("cus_subscribed");
        ext.setPaygSubscriptionId("sub_test");
        when(teamExtRepo.findById(100L)).thenReturn(Optional.of(ext));

        withTransactionSynchronization(() -> service.close(jobId));

        verify(meterReporter)
                .recordUsage(
                        100L,
                        "cus_subscribed",
                        10,
                        BillingCategory.AUTOMATION,
                        "process:" + jobId + ":close",
                        jobId);
    }

    @Test
    void close_freeTierTeam_doesNotPostMeterEvent() {
        UUID jobId = UUID.randomUUID();
        ProcessingJob job = openJob(jobId);
        when(jobService.close(jobId)).thenReturn(job);

        PaygShadowCharge row = chargedShadowRow(jobId, 100L, 4, BillingCategory.API);
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(Optional.of(row));

        // No stripe_customer_id → treated as free-tier on this branch (pre-#6532).
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(100L);
        ext.setStripeCustomerId(null);
        when(teamExtRepo.findById(100L)).thenReturn(Optional.of(ext));

        withTransactionSynchronization(() -> service.close(jobId));

        Mockito.verifyNoInteractions(meterReporter);
    }

    @Test
    void close_noTeamExtensionsRow_doesNotPostMeterEvent() {
        UUID jobId = UUID.randomUUID();
        ProcessingJob job = openJob(jobId);
        when(jobService.close(jobId)).thenReturn(job);

        PaygShadowCharge row = chargedShadowRow(jobId, 100L, 4, BillingCategory.API);
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(Optional.of(row));
        when(teamExtRepo.findById(100L)).thenReturn(Optional.empty());

        withTransactionSynchronization(() -> service.close(jobId));

        Mockito.verifyNoInteractions(meterReporter);
    }

    @Test
    void close_refundedShadowRow_doesNotPostMeterEvent() {
        UUID jobId = UUID.randomUUID();
        ProcessingJob job = openJob(jobId);
        when(jobService.close(jobId)).thenReturn(job);

        PaygShadowCharge row = chargedShadowRow(jobId, 100L, 4, BillingCategory.API);
        row.setStatus(ShadowChargeStatus.REFUNDED);
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(Optional.of(row));

        withTransactionSynchronization(() -> service.close(jobId));

        Mockito.verifyNoInteractions(meterReporter);
        Mockito.verifyNoInteractions(teamExtRepo);
    }

    @Test
    void close_noShadowRow_doesNotPostMeterEvent() {
        UUID jobId = UUID.randomUUID();
        ProcessingJob job = openJob(jobId);
        when(jobService.close(jobId)).thenReturn(job);

        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(Optional.empty());

        withTransactionSynchronization(() -> service.close(jobId));

        Mockito.verifyNoInteractions(meterReporter);
        Mockito.verifyNoInteractions(teamExtRepo);
    }

    @Test
    void close_bypassedCategoryOnShadowRow_doesNotPostMeterEvent() {
        // Defensive: BYPASSED rows shouldn't normally exist (the interceptor short-circuits
        // before openProcess), but if one slips through we must not meter it.
        UUID jobId = UUID.randomUUID();
        ProcessingJob job = openJob(jobId);
        when(jobService.close(jobId)).thenReturn(job);

        PaygShadowCharge row = chargedShadowRow(jobId, 100L, 4, BillingCategory.BYPASSED);
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(Optional.of(row));

        withTransactionSynchronization(() -> service.close(jobId));

        Mockito.verifyNoInteractions(meterReporter);
        Mockito.verifyNoInteractions(teamExtRepo);
    }

    @Test
    void close_meterReporterThrowsRuntimeException_doesNotPropagate() {
        // PaygMeterReportingService is documented to swallow; defence-in-depth in
        // JobChargeService catches a misbehaving impl so the afterCommit hook can't poison the
        // close flow.
        UUID jobId = UUID.randomUUID();
        ProcessingJob job = openJob(jobId);
        when(jobService.close(jobId)).thenReturn(job);

        PaygShadowCharge row = chargedShadowRow(jobId, 100L, 4, BillingCategory.AUTOMATION);
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId)).thenReturn(Optional.of(row));

        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(100L);
        ext.setStripeCustomerId("cus_subscribed");
        ext.setPaygSubscriptionId("sub_test");
        when(teamExtRepo.findById(100L)).thenReturn(Optional.of(ext));

        Mockito.doThrow(new RuntimeException("simulated meter failure"))
                .when(meterReporter)
                .recordUsage(
                        Mockito.anyLong(),
                        Mockito.anyString(),
                        Mockito.anyInt(),
                        Mockito.any(BillingCategory.class),
                        Mockito.anyString(),
                        Mockito.any(UUID.class));

        // Should not throw — afterCommit's defence-in-depth wraps the call.
        withTransactionSynchronization(() -> service.close(jobId));
        verify(meterReporter)
                .recordUsage(
                        100L,
                        "cus_subscribed",
                        4,
                        BillingCategory.AUTOMATION,
                        "process:" + jobId + ":close",
                        jobId);
    }

    @Test
    void close_noActiveTransactionSync_skipsMeterPostButStillClosesJob() {
        // Direct call without an outer @Transactional → no sync to register against. close()
        // must still close the job; the meter post is implicitly deferred to whatever async path
        // eventually wraps the call (or is never made, which is fine for ledger-only flows).
        UUID jobId = UUID.randomUUID();
        ProcessingJob job = openJob(jobId);
        when(jobService.close(jobId)).thenReturn(job);

        assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isFalse();
        service.close(jobId);

        Mockito.verifyNoInteractions(meterReporter);
        verify(jobService).close(jobId);
    }

    // --- chargeStandalone() — non-file billable actions (e.g. AI Create) -----------------------

    @Test
    void chargeStandalone_subscribedTeam_chargesAndMetersPaidPortion() {
        // AI Create-style charge: one standalone bookkeeping job, free split, ledger debit, meter.
        long teamId = 100L;
        PricingPolicy policy = stubPolicy(/*minCharge*/ 1, Map.of(JobSource.WEB, 10));
        when(policyService.getEffectivePolicy(teamId)).thenReturn(policy);

        UUID jobId = UUID.randomUUID();
        when(jobService.open(any(JobContext.class), eq(1))).thenReturn(openJob(jobId));
        when(jobService.close(jobId)).thenReturn(openJob(jobId));

        // Subscribed, no free grant left → the whole unit is paid and meters.
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(teamId);
        ext.setStripeCustomerId("cus_x");
        ext.setPaygSubscriptionId("sub_x");
        ext.setFreeUnitsRemaining(0L);
        when(teamExtRepo.findByIdForUpdate(teamId)).thenReturn(Optional.of(ext));
        when(teamExtRepo.findById(teamId)).thenReturn(Optional.of(ext));
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId))
                .thenReturn(Optional.of(chargedShadowRow(jobId, teamId, 1, 0, BillingCategory.AI)));

        ChargeContext ctx =
                new ChargeContext(
                        7L, teamId, JobSource.WEB, ProcessType.SINGLE_TOOL, BillingCategory.AI);
        ArgumentCaptor<WalletLedgerEntry> ledger = ArgumentCaptor.forClass(WalletLedgerEntry.class);

        withTransactionSynchronization(() -> service.chargeStandalone(ctx, 1));

        verify(jobService).open(any(JobContext.class), eq(1));
        verify(jobService).close(jobId);
        verify(ledgerRepo).save(ledger.capture());
        assertThat(ledger.getValue().getEntryType()).isEqualTo(LedgerEntryType.DEBIT);
        assertThat(ledger.getValue().getAmountUnits()).isEqualTo(-1);
        assertThat(ledger.getValue().getBillingCategory()).isEqualTo(BillingCategory.AI);
        verify(shadowRepo).save(any(PaygShadowCharge.class));
        // Paid portion (1) metered to Stripe after commit, keyed by the standard process key.
        verify(meterReporter)
                .recordUsage(
                        eq(teamId),
                        eq("cus_x"),
                        eq(1),
                        eq(BillingCategory.AI),
                        eq("process:" + jobId + ":close"),
                        eq(jobId));
    }

    @Test
    void chargeStandalone_freeTeamWithGrant_drawsGrantAndDoesNotMeter() {
        long teamId = 100L;
        PricingPolicy policy = stubPolicy(1, Map.of(JobSource.WEB, 10));
        when(policyService.getEffectivePolicy(teamId)).thenReturn(policy);

        UUID jobId = UUID.randomUUID();
        when(jobService.open(any(JobContext.class), eq(1))).thenReturn(openJob(jobId));
        when(jobService.close(jobId)).thenReturn(openJob(jobId));

        // Free grant available, no subscription → the unit is drawn from the grant, nothing meters.
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(teamId);
        ext.setFreeUnitsRemaining(50L);
        when(teamExtRepo.findByIdForUpdate(teamId)).thenReturn(Optional.of(ext));
        when(teamExtRepo.findById(teamId)).thenReturn(Optional.of(ext));
        when(shadowRepo.findFirstByJobIdOrderByIdAsc(jobId))
                .thenReturn(Optional.of(chargedShadowRow(jobId, teamId, 1, 1, BillingCategory.AI)));

        ChargeContext ctx =
                new ChargeContext(
                        7L, teamId, JobSource.WEB, ProcessType.SINGLE_TOOL, BillingCategory.AI);

        withTransactionSynchronization(() -> service.chargeStandalone(ctx, 1));

        assertThat(ext.getFreeUnitsRemaining()).isEqualTo(49L);
        verify(meterReporter, never())
                .recordUsage(any(), any(), Mockito.anyInt(), any(), any(), any());
    }

    @Test
    void chargeStandalone_bypassedCategory_throws() {
        ChargeContext ctx =
                new ChargeContext(
                        7L, 100L, JobSource.WEB, ProcessType.SINGLE_TOOL, BillingCategory.BYPASSED);
        assertThatThrownBy(() -> service.chargeStandalone(ctx, 1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static void withTransactionSynchronization(Runnable body) {
        TransactionSynchronizationManager.initSynchronization();
        try {
            body.run();
            // Drain registered synchronizations to simulate a successful commit.
            for (TransactionSynchronization sync :
                    TransactionSynchronizationManager.getSynchronizations()) {
                sync.afterCommit();
            }
        } finally {
            TransactionSynchronizationManager.clear();
        }
    }

    private static PaygShadowCharge chargedShadowRow(
            UUID jobId, Long teamId, int units, BillingCategory category) {
        return chargedShadowRow(jobId, teamId, units, 0, category);
    }

    private static PaygShadowCharge chargedShadowRow(
            UUID jobId, Long teamId, int units, int freeUnitsConsumed, BillingCategory category) {
        PaygShadowCharge row = new PaygShadowCharge();
        row.setJobId(jobId);
        row.setTeamId(teamId);
        row.setPaygUnits(units);
        row.setFreeUnitsConsumed(freeUnitsConsumed);
        row.setStatus(ShadowChargeStatus.CHARGED);
        row.setBillingCategory(category);
        return row;
    }

    // --- helpers --------------------------------------------------------------------------------

    private static PricingPolicy stubPolicy(int minCharge, Map<JobSource, Integer> stepLimits) {
        PricingPolicy p = new PricingPolicy();
        p.setId(42L);
        p.setVersion("v1-test");
        p.setEffectiveFrom(LocalDateTime.now());
        p.setDocPagesPerUnit(25);
        p.setDocBytesPerUnit(5L * 1024 * 1024);
        p.setMinChargeUnits(minCharge);
        p.setFileUnitCap(1000);
        p.setStepLimits(new HashMap<>(stepLimits));
        p.setIsDefault(true);
        return p;
    }

    private static ProcessingJob openJob(UUID id) {
        ProcessingJob j = new ProcessingJob();
        j.setId(id);
        j.setStatus(JobStatus.OPEN);
        j.setStepCount(1);
        j.setStartedAt(LocalDateTime.now());
        j.setLastStepAt(LocalDateTime.now());
        j.setSource(JobSource.WEB);
        j.setProcessType(ProcessType.SINGLE_TOOL);
        return j;
    }

    private static JobInput jobInput(Path tmp, String name, String contentType) throws IOException {
        Path p = tmp.resolve(name);
        Files.writeString(p, "fixture-" + name);
        MultipartFile mp = new MockMultipartFile("file", name, contentType, Files.readAllBytes(p));
        return new JobInput(mp, p);
    }
}
