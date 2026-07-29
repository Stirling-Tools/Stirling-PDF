package stirling.software.proprietary.policy.review;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.common.service.FileStorage;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.RunOrigin;
import stirling.software.proprietary.policy.model.WaitState;
import stirling.software.proprietary.policy.review.store.ReviewStore;
import stirling.software.proprietary.policy.store.PolicyStore;

@ExtendWith(MockitoExtension.class)
class ReviewGateTest {

    @Mock private PolicyStore policyStore;
    @Mock private ReviewStore reviewStore;
    @Mock private ClassificationMetadataReader metadataReader;
    @Mock private FileStorage fileStorage;

    private ReviewGate gate;
    private Policy policy;
    private PolicyRun run;
    private Resource output;

    @BeforeEach
    void setUp() throws IOException {
        gate = new ReviewGate(policyStore, reviewStore, metadataReader, fileStorage);
        policy =
                new Policy(
                        "p1",
                        "Classification Policy",
                        "owner",
                        true,
                        null,
                        List.of(),
                        List.of(new PipelineStep("/api/v1/ai/tools/classify-and-label", Map.of())),
                        OutputSpec.inline(),
                        7L);
        run =
                new PolicyRun(
                        "run-1",
                        "p1",
                        new PipelineDefinition("Classification Policy", policy.steps(), null));
        output = namedResource("scan.pdf");
        lenient().when(policyStore.get("p1")).thenReturn(Optional.of(policy));
        lenient()
                .when(fileStorage.storeFromResource(any(), anyString()))
                .thenReturn("stored-file-1");
    }

    private static Resource namedResource(String name) {
        return new ByteArrayResource("pdf".getBytes()) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }

    private void configureTeam(ReviewBucketConfig config) {
        lenient().when(reviewStore.configForTeam(7L)).thenReturn(config);
    }

    private static ReviewBucketConfig enabledConfig(
            List<String> watched, boolean holdUnlabeled, boolean holdLowConfidence) {
        return new ReviewBucketConfig(true, watched, true, holdUnlabeled, holdLowConfidence, 0.8);
    }

    @Test
    void watchedLabelHoldsTheRun() {
        configureTeam(enabledConfig(List.of("medical-form"), false, false));
        when(metadataReader.read(output))
                .thenReturn(
                        Optional.of(
                                new ClassificationOutcome(
                                        List.of(new LabelScore("medical-form", 0.95)), List.of())));

        Optional<WaitState> hold = gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output));

        assertTrue(hold.isPresent());
        assertEquals(List.of("stored-file-1"), hold.get().pendingFileIds());
        ReviewItem item = savedItem();
        assertEquals(ReviewReasonKind.WATCHED_LABEL, item.reasons().get(0).kind());
        assertEquals("medical-form", item.reasons().get(0).labelId());
        assertEquals(ReviewItemStatus.PENDING, item.status());
        assertEquals(7L, item.teamId());
    }

    @Test
    void lowConfidenceHoldsWhenOptedIn() {
        configureTeam(enabledConfig(List.of(), false, true));
        when(metadataReader.read(output))
                .thenReturn(
                        Optional.of(
                                new ClassificationOutcome(
                                        List.of(new LabelScore("invoice", 0.55)), List.of())));

        assertTrue(gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output)).isPresent());
        assertEquals(ReviewReasonKind.LOW_CONFIDENCE, savedItem().reasons().get(0).kind());
    }

    @Test
    void confidentUnwatchedLabelSailsThrough() {
        configureTeam(enabledConfig(List.of("medical-form"), true, true));
        when(metadataReader.read(output))
                .thenReturn(
                        Optional.of(
                                new ClassificationOutcome(
                                        List.of(new LabelScore("invoice", 0.97)), List.of())));

        assertTrue(gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output)).isEmpty());
        verify(reviewStore, never()).saveItem(any());
    }

    @Test
    void skippedWatchedCandidateHoldsTheRun() {
        configureTeam(enabledConfig(List.of("medical-form"), false, false));
        when(metadataReader.read(output))
                .thenReturn(
                        Optional.of(
                                new ClassificationOutcome(
                                        List.of(new LabelScore("invoice", 0.9)),
                                        List.of(
                                                new ConsideredLabel(
                                                        "medical-form",
                                                        0.35,
                                                        "mentions a patient")))));

        assertTrue(gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output)).isPresent());
        ReviewReason reason = savedItem().reasons().get(0);
        assertEquals(ReviewReasonKind.SKIPPED_LABEL, reason.kind());
        assertEquals("mentions a patient", reason.detail());
    }

    @Test
    void unlabeledDocumentHoldsOnlyWhenOptedIn() {
        configureTeam(enabledConfig(List.of(), false, false));
        when(metadataReader.read(output))
                .thenReturn(Optional.of(new ClassificationOutcome(List.of(), List.of())));
        assertTrue(gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output)).isEmpty());

        configureTeam(enabledConfig(List.of(), true, false));
        assertTrue(gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output)).isPresent());
        assertEquals(ReviewReasonKind.NO_LABEL, savedItem().reasons().get(0).kind());
    }

    @Test
    void unclassifiedOutputTriggersNoLabelRules() {
        // No classify step ran (metadata key absent) — must not be confused with "no label".
        configureTeam(enabledConfig(List.of("medical-form"), true, true));
        when(metadataReader.read(output)).thenReturn(Optional.empty());

        assertTrue(gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output)).isEmpty());
    }

    @Test
    void editorAndAdHocRunsAreNeverHeld() {
        assertTrue(gate.holdIfNeeded(run, RunOrigin.EDITOR, List.of(output)).isEmpty());
        assertTrue(gate.holdIfNeeded(run, RunOrigin.AD_HOC, List.of(output)).isEmpty());
        verify(reviewStore, never()).configForTeam(any());
    }

    @Test
    void disabledConfigHoldsNothing() {
        configureTeam(ReviewBucketConfig.defaults());

        assertTrue(gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output)).isEmpty());
        verify(metadataReader, never()).read(any());
    }

    @Test
    void persistFailureFailsOpen() throws IOException {
        configureTeam(enabledConfig(List.of("medical-form"), false, false));
        when(metadataReader.read(output))
                .thenReturn(
                        Optional.of(
                                new ClassificationOutcome(
                                        List.of(new LabelScore("medical-form", 0.95)), List.of())));
        when(fileStorage.storeFromResource(any(), anyString()))
                .thenThrow(new IOException("disk full"));

        assertTrue(gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output)).isEmpty());
        verify(reviewStore, never()).saveItem(any());
    }

    @Test
    void failedSourceRunIsRecordedWhenOptedIn() {
        configureTeam(enabledConfig(List.of(), false, false));
        run.fail("Policy run failed: boom");

        gate.recordFailure(run, RunOrigin.SOURCE, List.of(output));

        ReviewItem item = savedItem();
        assertEquals(ReviewReasonKind.RUN_FAILED, item.reasons().get(0).kind());
        assertEquals("Policy run failed: boom", item.reasons().get(0).detail());
        // The run produced no outputs, so its INPUTS are kept for inspection.
        assertEquals(
                List.of("stored-file-1"), item.files().stream().map(HeldFile::fileId).toList());
        assertTrue(item.filesAreInputs());
    }

    @Test
    void failedEditorRunIsNotRecorded() {
        run.fail("boom");

        gate.recordFailure(run, RunOrigin.EDITOR, List.of(output));

        verify(reviewStore, never()).saveItem(any());
    }

    @Test
    void failedRunNotRecordedWhenFailureCaptureIsOff() {
        configureTeam(new ReviewBucketConfig(true, List.of(), false, false, false, 0.8));
        run.fail("boom");

        gate.recordFailure(run, RunOrigin.SOURCE, List.of(output));

        verify(reviewStore, never()).saveItem(any());
    }

    @Test
    void heldItemFilesAreOutputsNotInputs() {
        configureTeam(enabledConfig(List.of("medical-form"), false, false));
        when(metadataReader.read(output))
                .thenReturn(
                        Optional.of(
                                new ClassificationOutcome(
                                        List.of(new LabelScore("medical-form", 0.95)), List.of())));

        gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output));

        assertFalse(savedItem().filesAreInputs());
    }

    private ReviewItem savedItem() {
        ArgumentCaptor<ReviewItem> captor = ArgumentCaptor.forClass(ReviewItem.class);
        verify(reviewStore).saveItem(captor.capture());
        return captor.getValue();
    }
}
