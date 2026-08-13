package stirling.software.proprietary.storage.egress;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.common.cluster.FileStore;
import stirling.software.common.cluster.inprocess.LocalDiskFileStore;
import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.engine.PolicyEngine;
import stirling.software.proprietary.policy.engine.PolicyRunHandle;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.repository.FileShareRepository;

/**
 * The fail-closed path: what a recipient actually receives, and what happens when the policy cannot
 * produce it.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShareEgressProcessorTest {

    private static final String POLICY_ID = "policy-1";
    private static final String FINGERPRINT = "fingerprint";
    private static final String FLATTEN = "/api/v1/misc/flatten";
    private static final byte[] ORIGINAL = {1, 1, 1};
    private static final byte[] PROCESSED = {2, 2, 2, 2};

    @Mock private PolicyStore policyStore;
    @Mock private PolicyEngine policyEngine;
    @Mock private FileShareRepository fileShareRepository;

    private FileStore fileStore;
    private ShareEgressProcessor processor;
    private FileShare share;

    @BeforeEach
    void setUp(@TempDir Path tempDir) {
        fileStore = new LocalDiskFileStore(tempDir.toString());
        processor =
                new ShareEgressProcessor(policyStore, policyEngine, fileStore, fileShareRepository);
        share = new FileShare();
        share.setId(5L);
        share.setShareToken("tok");
        share.setAccessRole(ShareAccessRole.VIEWER);
        when(policyStore.get(POLICY_ID)).thenReturn(Optional.of(watermarkPolicy()));
    }

    @Test
    void anUngovernedDeliveryServesTheStoredOriginal() {
        Resource original = original();

        Resource served = processor.resolve(share, original, unrestricted());

        assertThat(served).isSameAs(original);
        verifyNoInteractions(policyEngine);
    }

    @Test
    void aPolicyChainProducesTheCopyThatIsServed() throws Exception {
        runProduces(PROCESSED);

        Resource served = processor.resolve(share, original(), transforming());

        assertThat(served.getContentAsByteArray()).isEqualTo(PROCESSED);
        assertThat(served.getFilename()).isEqualTo("doc.pdf");
    }

    @Test
    void theProcessedCopyIsCachedAgainstTheShare() throws Exception {
        String fileId = runProduces(PROCESSED);

        processor.resolve(share, original(), transforming());

        verify(fileShareRepository).save(share);
        assertThat(share.getEgressFileId()).isEqualTo(fileId);
        assertThat(share.getEgressFingerprint()).isEqualTo(FINGERPRINT);
    }

    @Test
    void aSecondRecipientIsServedTheCachedCopyWithoutRerunningThePolicy() throws Exception {
        // Stored owned by whoever's download derived it; a different recipient on the same link
        // must still be able to read it (this used to throw SecurityException and 500).
        String cached = store(PROCESSED, "recipient-a@partner.com");
        share.setEgressFileId(cached);
        share.setEgressFingerprint(FINGERPRINT);

        Resource served = processor.resolve(share, original(), transforming());

        assertThat(served.getContentAsByteArray()).isEqualTo(PROCESSED);
        verifyNoInteractions(policyEngine);
    }

    @Test
    void aCopyStampedForADifferentDecisionIsRederived() throws Exception {
        share.setEgressFileId(store(new byte[] {9}, "recipient-a@partner.com"));
        share.setEgressFingerprint("stale");
        runProduces(PROCESSED);

        Resource served = processor.resolve(share, original(), transforming());

        assertThat(served.getContentAsByteArray()).isEqualTo(PROCESSED);
    }

    @Test
    void aSweptCacheEntryIsRederived() throws Exception {
        share.setEgressFileId("6f1a3f26-0c1a-4a1e-9c2f-2f0f9a5a1b2c");
        share.setEgressFingerprint(FINGERPRINT);
        runProduces(PROCESSED);

        assertThat(processor.resolve(share, original(), transforming()).getContentAsByteArray())
                .isEqualTo(PROCESSED);
    }

    @Test
    void aViewOnlyDecisionRasterisesEvenWithNoToolChain() throws Exception {
        runProduces(PROCESSED);

        Resource served = processor.resolve(share, original(), viewOnly(List.of()));

        assertThat(served.getContentAsByteArray()).isEqualTo(PROCESSED);
        assertThat(ranOperations()).containsExactly(FLATTEN);
    }

    @Test
    void aViewOnlyDecisionRasterisesAfterTheToolChain() throws Exception {
        runProduces(PROCESSED);

        processor.resolve(share, original(), viewOnly(List.of(POLICY_ID)));

        assertThat(ranOperations()).containsExactly("/api/v1/security/add-watermark", FLATTEN);
    }

    @Test
    void aFailedRunReleasesNothing() {
        PolicyRun run = new PolicyRun("run-1", POLICY_ID, definition(), null);
        run.fail("watermark blew up");
        when(policyEngine.runPolicy(any(), any(), any()))
                .thenReturn(new PolicyRunHandle("run-1", CompletableFuture.completedFuture(run)));

        assertThatThrownBy(() -> processor.resolve(share, original(), transforming()))
                .isInstanceOf(ShareEgressException.class)
                .hasMessageContaining("was not released");
    }

    @Test
    void aRunThatBlowsUpIsCancelledAndReleasesNothing() {
        when(policyEngine.runPolicy(any(), any(), any()))
                .thenReturn(
                        new PolicyRunHandle(
                                "run-1",
                                CompletableFuture.failedFuture(new IllegalStateException("boom"))));

        assertThatThrownBy(() -> processor.resolve(share, original(), transforming()))
                .isInstanceOf(ShareEgressException.class);
        verify(policyEngine).cancel("run-1");
    }

    @Test
    void aPolicyDeletedMidFlightReleasesNothing() {
        when(policyStore.get(anyString())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> processor.resolve(share, original(), transforming()))
                .isInstanceOf(ShareEgressException.class)
                .hasMessageContaining("no longer available");
        verifyNoInteractions(policyEngine);
    }

    @Test
    void aCacheWriteThatFailsDoesNotFailTheDelivery() throws Exception {
        runProduces(PROCESSED);
        when(fileShareRepository.save(any())).thenThrow(new IllegalStateException("db down"));

        assertThat(processor.resolve(share, original(), transforming()).getContentAsByteArray())
                .isEqualTo(PROCESSED);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    /** Every operation the engine was asked to run, in order. */
    private List<String> ranOperations() {
        ArgumentCaptor<Policy> captor = ArgumentCaptor.forClass(Policy.class);
        verify(policyEngine, org.mockito.Mockito.atLeastOnce())
                .runPolicy(captor.capture(), any(), any());
        return captor.getAllValues().stream()
                .flatMap(policy -> policy.steps().stream())
                .map(PipelineStep::operation)
                .toList();
    }

    /** Stubs the engine so every run stores {@code bytes} and completes; returns the last id. */
    private String runProduces(byte[] bytes) throws IOException {
        String fileId = store(bytes, "recipient-a@partner.com");
        when(policyEngine.runPolicy(any(), any(), any()))
                .thenAnswer(
                        invocation -> {
                            PolicyRun run = new PolicyRun("run-1", POLICY_ID, definition(), null);
                            run.complete(List.of(ResultFile.builder().fileId(fileId).build()));
                            return new PolicyRunHandle(
                                    "run-1", CompletableFuture.completedFuture(run));
                        });
        return fileId;
    }

    private String store(byte[] bytes, String owner) throws IOException {
        return fileStore.store(new ByteArrayInputStream(bytes), "processed.pdf", owner).fileId();
    }

    private static Resource original() {
        return new ByteArrayResource(ORIGINAL) {
            @Override
            public String getFilename() {
                return "doc.pdf";
            }
        };
    }

    private static PipelineDefinition definition() {
        return new PipelineDefinition("Sharing Policy", List.of(), OutputSpec.inline());
    }

    private static Policy watermarkPolicy() {
        return new Policy(
                POLICY_ID,
                "Sharing Policy",
                "alice@example.com",
                true,
                List.of(),
                List.of(new PipelineStep("/api/v1/security/add-watermark", Map.of())),
                OutputSpec.inline(),
                7L);
    }

    private static ShareEgressDecision unrestricted() {
        return ShareEgressDecision.unrestricted(ShareAccessRole.VIEWER);
    }

    private static ShareEgressDecision transforming() {
        return new ShareEgressDecision(
                true,
                null,
                ShareAccessRole.VIEWER,
                null,
                false,
                false,
                POLICY_ID,
                "Sharing Policy",
                List.of(POLICY_ID),
                FINGERPRINT);
    }

    private static ShareEgressDecision viewOnly(List<String> transformPolicyIds) {
        return new ShareEgressDecision(
                true,
                null,
                ShareAccessRole.VIEWER,
                1,
                true,
                true,
                POLICY_ID,
                "Sharing Policy",
                transformPolicyIds,
                FINGERPRINT);
    }
}
