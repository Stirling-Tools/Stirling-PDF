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
import stirling.software.proprietary.policy.review.signal.ClassificationConfidenceSource;
import stirling.software.proprietary.policy.review.signal.ConfidenceSignal;
import stirling.software.proprietary.policy.review.signal.ConfidenceSignalSource;
import stirling.software.proprietary.policy.review.store.ReviewStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.service.AiFeatureGate;

@ExtendWith(MockitoExtension.class)
class ReviewGateTest {

    @Mock private PolicyStore policyStore;
    @Mock private ReviewStore reviewStore;
    @Mock private ClassificationMetadataReader metadataReader;
    @Mock private AiFeatureGate aiFeatureGate;
    @Mock private FileStorage fileStorage;

    private ReviewGate gate;
    private Policy policy;
    private PolicyRun run;
    private Resource output;

    /** What the run was bound for; the item must record all of them, not just the first. */
    private static final List<OutputSpec> DESTINATIONS =
            List.of(OutputSpec.folder("/srv/out"), OutputSpec.folder("/mnt/archive"));

    /** Stands in for any future tool that reports a confidence. */
    private StubSignalSource otherTool;

    /** A producer that isn't the classifier, to prove the rule isn't classification-specific. */
    private static final class StubSignalSource implements ConfidenceSignalSource {
        private List<ConfidenceSignal> signals = List.of();
        private RuntimeException failure;

        @Override
        public String producer() {
            return "ocr";
        }

        @Override
        public List<ConfidenceSignal> read(Resource output) {
            if (failure != null) {
                throw failure;
            }
            return signals;
        }
    }

    @BeforeEach
    void setUp() throws IOException {
        ClassificationConfidenceSource classificationSignals =
                new ClassificationConfidenceSource(metadataReader);
        otherTool = new StubSignalSource();
        gate =
                new ReviewGate(
                        policyStore,
                        reviewStore,
                        metadataReader,
                        classificationSignals,
                        List.of(classificationSignals, otherTool),
                        aiFeatureGate,
                        fileStorage);
        lenient().when(aiFeatureGate.isClassifyAvailable()).thenReturn(true);
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
                        new PipelineDefinition(
                                "Classification Policy", policy.steps(), DESTINATIONS));
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

        Optional<WaitState> hold =
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS);

        assertTrue(hold.isPresent());
        assertEquals(List.of("stored-file-1"), hold.get().pendingFileIds());
        ReviewItem item = savedItem();
        assertEquals(ReviewReasonKind.WATCHED_LABEL, item.reasons().get(0).kind());
        assertEquals("medical-form", item.reasons().get(0).labelId());
        assertEquals(ReviewItemStatus.PENDING, item.status());
        assertEquals(7L, item.teamId());
        // Both destinations are recorded, so approval can release to each of them.
        assertEquals(DESTINATIONS, item.outputs());
    }

    @Test
    void lowConfidenceHoldsWhenOptedIn() {
        configureTeam(enabledConfig(List.of(), false, true));
        when(metadataReader.read(output))
                .thenReturn(
                        Optional.of(
                                new ClassificationOutcome(
                                        List.of(new LabelScore("invoice", 0.55)), List.of())));

        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS)
                        .isPresent());
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

        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS).isEmpty());
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

        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS)
                        .isPresent());
        ReviewReason reason = savedItem().reasons().get(0);
        assertEquals(ReviewReasonKind.SKIPPED_LABEL, reason.kind());
        assertEquals("mentions a patient", reason.detail());
    }

    @Test
    void unlabeledDocumentHoldsOnlyWhenOptedIn() {
        configureTeam(enabledConfig(List.of(), false, false));
        when(metadataReader.read(output))
                .thenReturn(Optional.of(new ClassificationOutcome(List.of(), List.of())));
        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS).isEmpty());

        configureTeam(enabledConfig(List.of(), true, false));
        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS)
                        .isPresent());
        assertEquals(ReviewReasonKind.NO_LABEL, savedItem().reasons().get(0).kind());
    }

    @Test
    void unclassifiedOutputTriggersNoLabelRules() {
        // No classify step ran (metadata key absent) — must not be confused with "no label".
        configureTeam(enabledConfig(List.of("medical-form"), true, true));
        when(metadataReader.read(output)).thenReturn(Optional.empty());

        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS).isEmpty());
    }

    @Test
    void editorAndAdHocRunsAreNeverHeld() {
        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.EDITOR, List.of(output), DESTINATIONS).isEmpty());
        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.AD_HOC, List.of(output), DESTINATIONS).isEmpty());
        verify(reviewStore, never()).configForTeam(any());
    }

    @Test
    void disabledConfigHoldsNothing() {
        configureTeam(ReviewBucketConfig.defaults());

        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS).isEmpty());
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

        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS).isEmpty());
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
    void lowConfidenceFromAnyToolHoldsTheRun() {
        // Nothing classified this file; an unrelated tool simply said it wasn't sure.
        configureTeam(enabledConfig(List.of(), false, true));
        when(metadataReader.read(output)).thenReturn(Optional.empty());
        otherTool.signals = List.of(new ConfidenceSignal("ocr", "page 3", 0.42, "faint scan"));

        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS)
                        .isPresent());
        ReviewReason reason = savedItem().reasons().get(0);
        assertEquals(ReviewReasonKind.LOW_CONFIDENCE, reason.kind());
        assertEquals("ocr", reason.producer());
        assertEquals("page 3", reason.labelId());
        assertEquals("faint scan", reason.detail());
    }

    @Test
    void confidentOtherToolSignalSailsThrough() {
        configureTeam(enabledConfig(List.of(), false, true));
        when(metadataReader.read(output)).thenReturn(Optional.empty());
        otherTool.signals = List.of(new ConfidenceSignal("ocr", "page 3", 0.99));

        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS).isEmpty());
        verify(reviewStore, never()).saveItem(any());
    }

    @Test
    void otherToolSignalsAreIgnoredWhenLowConfidenceIsOff() {
        configureTeam(enabledConfig(List.of(), false, false));
        when(metadataReader.read(output)).thenReturn(Optional.empty());
        otherTool.signals = List.of(new ConfidenceSignal("ocr", "page 3", 0.01));

        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS).isEmpty());
    }

    @Test
    void aBrokenSignalSourceCannotBreakTheRun() {
        configureTeam(enabledConfig(List.of(), false, true));
        when(metadataReader.read(output)).thenReturn(Optional.empty());
        otherTool.failure = new IllegalStateException("reader exploded");

        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS).isEmpty());
        verify(reviewStore, never()).saveItem(any());
    }

    @Test
    void classificationConfidenceIsReadWithoutReopeningTheFile() {
        configureTeam(enabledConfig(List.of(), false, true));
        when(metadataReader.read(output))
                .thenReturn(
                        Optional.of(
                                new ClassificationOutcome(
                                        List.of(new LabelScore("invoice", 0.55)), List.of())));

        assertTrue(
                gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS)
                        .isPresent());
        assertEquals("classification", savedItem().reasons().get(0).producer());
        // One read for the label rules; the classifier's signals come off that same outcome.
        verify(metadataReader).read(output);
    }

    @Test
    void failedRunIsNotRecordedWhenItsAiStepIsUnavailable() {
        // AI off + an AI-backed policy: every file would fail identically, and approving would just
        // re-run the same missing step. Nothing actionable, so nothing queued.
        configureTeam(enabledConfig(List.of(), false, false));
        when(aiFeatureGate.isClassifyAvailable()).thenReturn(false);
        run.fail("Policy run failed: AI feature 'classify' is disabled");

        gate.recordFailure(run, RunOrigin.SOURCE, List.of(output));

        verify(reviewStore, never()).saveItem(any());
    }

    @Test
    void failedRunIsStillRecordedWithAiOffWhenThePolicyNeedsNoAi() {
        Policy noAi =
                new Policy(
                        "p1",
                        "Watermark Policy",
                        "owner",
                        true,
                        null,
                        List.of(),
                        List.of(new PipelineStep("/api/v1/security/add-watermark", Map.of())),
                        OutputSpec.inline(),
                        7L);
        when(policyStore.get("p1")).thenReturn(Optional.of(noAi));
        configureTeam(enabledConfig(List.of(), false, false));
        when(aiFeatureGate.isClassifyAvailable()).thenReturn(false);
        run.fail("Policy run failed: boom");

        gate.recordFailure(run, RunOrigin.SOURCE, List.of(output));

        assertEquals(ReviewReasonKind.RUN_FAILED, savedItem().reasons().get(0).kind());
    }

    @Test
    void heldItemFilesAreOutputsNotInputs() {
        configureTeam(enabledConfig(List.of("medical-form"), false, false));
        when(metadataReader.read(output))
                .thenReturn(
                        Optional.of(
                                new ClassificationOutcome(
                                        List.of(new LabelScore("medical-form", 0.95)), List.of())));

        gate.holdIfNeeded(run, RunOrigin.SOURCE, List.of(output), DESTINATIONS);

        assertFalse(savedItem().filesAreInputs());
    }

    private ReviewItem savedItem() {
        ArgumentCaptor<ReviewItem> captor = ArgumentCaptor.forClass(ReviewItem.class);
        verify(reviewStore).saveItem(captor.capture());
        return captor.getValue();
    }
}
