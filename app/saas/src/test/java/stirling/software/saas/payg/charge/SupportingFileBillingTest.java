package stirling.software.saas.payg.charge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.util.TempFileManager;
import stirling.software.saas.payg.billing.TeamBillingService;
import stirling.software.saas.payg.bundle.PrepaidBundleService;
import stirling.software.saas.payg.docs.DefaultDocumentClassifier;
import stirling.software.saas.payg.job.JobService;
import stirling.software.saas.payg.job.ProcessingJob;
import stirling.software.saas.payg.lineage.ByteHashSignatureExtractor;
import stirling.software.saas.payg.lineage.DefaultHashLineageDetector;
import stirling.software.saas.payg.lineage.InMemoryJobLineageStore;
import stirling.software.saas.payg.meter.PaygMeterReportingService;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;
import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.policy.PricingPolicyService;
import stirling.software.saas.payg.repository.PaygShadowChargeRepository;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.ProcessingJobRepository;
import stirling.software.saas.payg.repository.ProcessingJobStepRepository;
import stirling.software.saas.payg.repository.WalletLedgerRepository;
import stirling.software.saas.payg.wallet.WalletLedgerEntry;

/** Uses real hashing, job grouping and unit calculation; persistence stays in memory. */
class SupportingFileBillingTest {

    private static final ChargeContext CONTEXT =
            new ChargeContext(
                    42L,
                    100L,
                    JobSource.PIPELINE,
                    ProcessType.SINGLE_TOOL,
                    BillingCategory.AUTOMATION,
                    "run");

    @TempDir Path tempDir;

    private final Map<UUID, ProcessingJob> jobs = new HashMap<>();
    private final List<WalletLedgerEntry> debits = new ArrayList<>();
    private JobService jobService;
    private JobChargeService chargeService;
    private PricingPolicy policy;

    @BeforeEach
    void setUp() {
        InMemoryJobLineageStore store = new InMemoryJobLineageStore();
        ProcessingJobRepository jobRepository = mock(ProcessingJobRepository.class);
        when(jobRepository.save(any()))
                .thenAnswer(
                        invocation -> {
                            ProcessingJob job = invocation.getArgument(0);
                            jobs.put(job.getId(), job);
                            store.registerJob(
                                    job.getId(),
                                    job.getOwnerUserId(),
                                    job.getStatus(),
                                    job.getLastStepAt());
                            return job;
                        });
        when(jobRepository.findById(any()))
                .thenAnswer(invocation -> Optional.ofNullable(jobs.get(invocation.getArgument(0))));
        Duration window = Duration.ofMinutes(5);
        jobService =
                new JobService(
                        new DefaultHashLineageDetector(
                                List.of(new ByteHashSignatureExtractor()), store, window),
                        jobRepository,
                        mock(ProcessingJobStepRepository.class),
                        window);
        policy = new PricingPolicy();
        policy.setId(7L);
        policy.setDocPagesPerUnit(25);
        policy.setDocBytesPerUnit(1024L);
        policy.setFileUnitCap(1000);
        policy.setMinChargeUnits(1);
        policy.setStepLimits(Map.of(JobSource.PIPELINE, 10));
        PricingPolicyService policies = mock(PricingPolicyService.class);
        when(policies.getEffectivePolicy(100L)).thenReturn(policy);
        WalletLedgerRepository ledger = mock(WalletLedgerRepository.class);
        when(ledger.save(any()))
                .thenAnswer(
                        invocation -> {
                            WalletLedgerEntry debit = invocation.getArgument(0);
                            debits.add(debit);
                            return debit;
                        });
        chargeService =
                new JobChargeService(
                        jobService,
                        policies,
                        new DefaultDocumentClassifier(mock(TempFileManager.class)),
                        mock(PaygShadowChargeRepository.class),
                        jobRepository,
                        mock(PaygTeamExtensionsRepository.class),
                        mock(PaygMeterReportingService.class),
                        ledger,
                        mock(PrepaidBundleService.class),
                        mock(TeamBillingService.class));
    }

    @Test
    void sharedAssetKeepsDocumentsSeparateAndStillContributesUnits() throws IOException {
        JobInput asset = input("stampImage", "logo", new byte[2050]);
        JobInput first = input("fileInput", "first", new byte[] {1});
        JobInput second = input("fileInput", "second", new byte[] {2});

        ChargeOutcome firstCharge = charge(first, asset);
        ChargeOutcome secondCharge = charge(second, asset);

        assertThat(firstCharge.units()).isEqualTo(4);
        assertThat(secondCharge.units()).isEqualTo(4);
        assertThat(secondCharge.processId()).isNotEqualTo(firstCharge.processId());
        assertThat(debits).extracting(WalletLedgerEntry::getAmountUnits).containsExactly(-4, -4);
        assertThat(debits).extracting(WalletLedgerEntry::getDocCount).containsExactly(1, 1);

        JobInput firstOutput = input("fileInput", "first-output", new byte[] {3});
        JobInput secondOutput = input("fileInput", "second-output", new byte[] {4});
        jobService.recordOutput(firstCharge.processId(), firstOutput.path());
        jobService.recordOutput(secondCharge.processId(), secondOutput.path());

        assertJoined(charge(firstOutput, asset), firstCharge);
        assertJoined(charge(secondOutput, asset), secondCharge);
        assertJoined(charge(firstOutput), firstCharge);
        assertThat(debits).hasSize(2);
    }

    @Test
    void supportingAssetsDoNotBecomeDocumentLineage() throws IOException {
        JobInput asset = input("overlayFiles", "overlay", new byte[] {1});
        ChargeOutcome first = charge(input("fileInput", "primary", new byte[] {2}), asset);

        ChargeOutcome reusedAsPrimary =
                charge(input("fileInput", "overlay-as-primary", new byte[] {1}));

        assertThat(reusedAsPrimary.disposition()).isEqualTo(ChargeOutcome.Disposition.OPENED);
        assertThat(reusedAsPrimary.processId()).isNotEqualTo(first.processId());
        assertThat(debits).extracting(WalletLedgerEntry::getAmountUnits).containsExactly(-2, -1);
    }

    @Test
    void eachDocumentKeepsItsOwnAllowanceWhenAnAssetIsShared() throws IOException {
        policy.setStepLimits(Map.of(JobSource.PIPELINE, 2));
        JobInput asset = input("stampImage", "logo", new byte[] {3});
        JobInput first = input("fileInput", "first", new byte[] {1});
        JobInput second = input("fileInput", "second", new byte[] {2});
        ChargeOutcome firstCharge = charge(first, asset);
        ChargeOutcome secondCharge = charge(second, asset);

        assertJoined(charge(first, asset), firstCharge);
        assertJoined(charge(second, asset), secondCharge);
        ChargeOutcome overflow = charge(first, asset);

        assertThat(overflow.disposition()).isEqualTo(ChargeOutcome.Disposition.OPENED);
        assertThat(overflow.units()).isEqualTo(2);
        assertThat(jobs.get(secondCharge.processId()).getStepCount()).isEqualTo(2);
        assertThat(debits)
                .extracting(WalletLedgerEntry::getAmountUnits)
                .containsExactly(-2, -2, -2);
    }

    @Test
    void allPrimaryFilesStillParticipateInMergeMatching() throws IOException {
        JobInput first = input("fileInput", "first", new byte[] {1});
        JobInput second = input("fileInput", "second", new byte[] {2});
        JobInput asset = input("stampImage", "logo", new byte[] {3});
        ChargeOutcome firstCharge = charge(first, asset);

        assertJoined(charge(second, first, asset), firstCharge);
        assertThat(debits).hasSize(1);
    }

    @Test
    void toolsWithoutFileInputKeepTheirExistingInputGrouping() throws IOException {
        JobInput first = input("fileInput1", "first", new byte[] {1});
        JobInput second = input("fileInput2", "second", new byte[] {2});
        ChargeOutcome original = charge(first, second);

        assertThat(original.units()).isEqualTo(2);
        assertJoined(charge(first, second), original);
        assertThat(debits).extracting(WalletLedgerEntry::getDocCount).containsExactly(2);
    }

    private ChargeOutcome charge(JobInput... inputs) throws IOException {
        return chargeService.openProcess(CONTEXT, List.of(inputs));
    }

    private JobInput input(String field, String name, byte[] contents) throws IOException {
        Path path = tempDir.resolve(name + ".bin");
        Files.write(path, contents);
        return new JobInput(
                new MockMultipartFile(field, name + ".bin", "application/octet-stream", contents),
                path);
    }

    private static void assertJoined(ChargeOutcome outcome, ChargeOutcome original) {
        assertThat(outcome.processId()).isEqualTo(original.processId());
        assertThat(outcome.disposition()).isEqualTo(ChargeOutcome.Disposition.JOINED);
        assertThat(outcome.units()).isZero();
    }
}
