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
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.saas.payg.docs.DocumentClassifier;
import stirling.software.saas.payg.docs.DocumentMetrics;
import stirling.software.saas.payg.job.JobContext;
import stirling.software.saas.payg.job.JobService;
import stirling.software.saas.payg.job.JoinOrOpenResult;
import stirling.software.saas.payg.job.ProcessingJob;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.JobStatus;
import stirling.software.saas.payg.model.ProcessType;
import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.policy.PricingPolicyService;
import stirling.software.saas.payg.repository.PaygShadowChargeRepository;
import stirling.software.saas.payg.shadow.PaygShadowCharge;

/**
 * Exercises {@link JobChargeService} as an orchestrator: policy lookup, step-limit resolution,
 * delegate to {@code JobService}, write shadow row when OPENED, skip everything when JOINED.
 */
class JobChargeServiceTest {

    private JobService jobService;
    private PricingPolicyService policyService;
    private DocumentClassifier classifier;
    private PaygShadowChargeRepository shadowRepo;
    private JobChargeService service;

    @BeforeEach
    void setUp() {
        jobService = Mockito.mock(JobService.class);
        policyService = Mockito.mock(PricingPolicyService.class);
        classifier = Mockito.mock(DocumentClassifier.class);
        shadowRepo = Mockito.mock(PaygShadowChargeRepository.class);
        service = new JobChargeService(jobService, policyService, classifier, shadowRepo);
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
                        new ChargeContext(42L, 100L, JobSource.WEB, ProcessType.SINGLE_TOOL),
                        List.of(in));

        assertThat(out.disposition()).isEqualTo(ChargeOutcome.Disposition.JOINED);
        assertThat(out.processId()).isEqualTo(joinedJob.getId());
        assertThat(out.units()).isZero();
        verify(classifier, never()).classify(any(MultipartFile.class), any());
        verify(classifier, never()).classify(anyList(), any());
        verify(shadowRepo, never()).save(any());
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
        when(classifier.classify(any(MultipartFile.class), eq(policy)))
                .thenReturn(new DocumentMetrics(50, 1024L, "application/pdf", 4));

        ChargeOutcome out =
                service.openProcess(
                        new ChargeContext(42L, 100L, JobSource.WEB, ProcessType.SINGLE_TOOL),
                        List.of(in));

        assertThat(out.disposition()).isEqualTo(ChargeOutcome.Disposition.OPENED);
        assertThat(out.units()).isEqualTo(4);
        // Single-file path called single-file classifier overload, not the list one.
        verify(classifier, times(1)).classify(any(MultipartFile.class), eq(policy));
        verify(classifier, never()).classify(anyList(), eq(policy));

        ArgumentCaptor<PaygShadowCharge> captor = ArgumentCaptor.forClass(PaygShadowCharge.class);
        verify(shadowRepo).save(captor.capture());
        PaygShadowCharge row = captor.getValue();
        assertThat(row.getTeamId()).isEqualTo(100L);
        assertThat(row.getJobId()).isEqualTo(newJob.getId());
        assertThat(row.getPolicyId()).isEqualTo(policy.getId());
        assertThat(row.getPaygUnits()).isEqualTo(4);
        // Legacy comparison not wired yet — zeroed until CreditService is wired in the follow-up.
        assertThat(row.getLegacyCreditsCharged()).isZero();
        assertThat(row.getDiffPct()).isZero();

        // Job entity carries the classified docUnits so close-time receipts can render correctly.
        assertThat(newJob.getDocUnits()).isEqualTo(4);
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
        when(classifier.classify(anyList(), eq(policy)))
                .thenReturn(new DocumentMetrics(100, 2048L, "application/pdf", 7));

        ChargeOutcome out =
                service.openProcess(
                        new ChargeContext(42L, 100L, JobSource.WEB, ProcessType.AUTOMATION),
                        List.of(a, b));

        assertThat(out.units()).isEqualTo(7);
        verify(classifier, never()).classify(any(MultipartFile.class), any());
        verify(classifier, times(1)).classify(anyList(), eq(policy));
    }

    @Test
    void openProcess_minChargeUnitsFloorApplied(@TempDir Path tmp) throws IOException {
        // Policy says min 5 units. Classifier returns 2. Expect 5 to be charged.
        PricingPolicy policy = stubPolicy(/*minCharge*/ 5, Map.of(JobSource.WEB, 10));
        when(policyService.getEffectivePolicy(100L)).thenReturn(policy);
        ProcessingJob newJob = openJob(UUID.randomUUID());
        when(jobService.joinOrOpen(any(JobContext.class), anyList()))
                .thenReturn(new JoinOrOpenResult(newJob, JoinOrOpenResult.Disposition.OPENED));
        when(classifier.classify(any(MultipartFile.class), eq(policy)))
                .thenReturn(new DocumentMetrics(10, 1024L, "application/pdf", 2));

        ChargeOutcome out =
                service.openProcess(
                        new ChargeContext(42L, 100L, JobSource.WEB, ProcessType.SINGLE_TOOL),
                        List.of(jobInput(tmp, "in.pdf", "application/pdf")));

        assertThat(out.units()).isEqualTo(5);
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
        when(classifier.classify(any(MultipartFile.class), eq(policy)))
                .thenReturn(new DocumentMetrics(1, 100L, "application/pdf", 1));

        service.openProcess(
                new ChargeContext(42L, 100L, JobSource.PIPELINE, ProcessType.AUTOMATION),
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
        when(classifier.classify(any(MultipartFile.class), eq(policy)))
                .thenReturn(new DocumentMetrics(1, 100L, "application/pdf", 1));

        service.openProcess(
                new ChargeContext(42L, 100L, JobSource.DESKTOP_APP, ProcessType.SINGLE_TOOL),
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
                                                42L, 100L, JobSource.WEB, ProcessType.SINGLE_TOOL),
                                        List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("inputs must not be empty");
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
