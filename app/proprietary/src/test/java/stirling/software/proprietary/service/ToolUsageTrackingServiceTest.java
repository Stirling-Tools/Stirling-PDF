package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.ToolChainStat;
import stirling.software.proprietary.model.ToolUsageStat;
import stirling.software.proprietary.repository.ToolChainStatRepository;
import stirling.software.proprietary.repository.ToolUsageStatRepository;

@ExtendWith(MockitoExtension.class)
class ToolUsageTrackingServiceTest {

    private static final String PRINCIPAL = "alice";
    private static final String NONE = ToolUsageStat.NO_PREVIOUS_TOOL;
    private static final long TODAY = ToolUsageTrackingService.currentEpochDay();

    /** One input document that has been through no tools yet. */
    private static final List<List<String>> FRESH = List.of(List.of());

    @Mock private ToolUsageStatRepository usageRepository;
    @Mock private ToolChainStatRepository chainRepository;

    private ApplicationProperties properties;
    private ToolUsageTrackingService service;

    @BeforeEach
    void setUp() {
        properties = new ApplicationProperties();
        properties.getSystem().setEnableAnalytics(true);
        service = new ToolUsageTrackingService(usageRepository, chainRepository, properties);
    }

    @SafeVarargs
    private static List<List<String>> chains(List<String>... documents) {
        return List.of(documents);
    }

    @Nested
    @DisplayName("Recording transitions")
    class RecordingTransitions {

        @Test
        @DisplayName("a fresh document increments the no-previous-tool row")
        void recordsPlainRun() {
            when(usageRepository.incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1))
                    .thenReturn(1);

            service.recordUsage(PRINCIPAL, "compare", FRESH);

            verify(usageRepository).incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1);
            verifyNoInteractions(chainRepository);
        }

        @Test
        @DisplayName("the previous tool applied to the document is the transition edge")
        void recordsTransitionEdge() {
            when(usageRepository.incrementCount(PRINCIPAL, "compare", "ocr", TODAY, 1))
                    .thenReturn(1);
            when(chainRepository.incrementCount(PRINCIPAL, "compare>ocr", TODAY, 1)).thenReturn(1);

            service.recordUsage(PRINCIPAL, "ocr", chains(List.of("compare")));

            verify(usageRepository).incrementCount(PRINCIPAL, "compare", "ocr", TODAY, 1);
        }

        @Test
        @DisplayName("only the document's last step counts, not the whole chain")
        void transitionUsesLastStepOnly() {
            when(usageRepository.incrementCount(PRINCIPAL, "watermark", "ocr", TODAY, 1))
                    .thenReturn(1);
            when(chainRepository.incrementCount(anyString(), anyString(), anyLong(), anyLong()))
                    .thenReturn(1);

            service.recordUsage(PRINCIPAL, "ocr", chains(List.of("compress", "watermark")));

            verify(usageRepository).incrementCount(PRINCIPAL, "watermark", "ocr", TODAY, 1);
        }

        @Test
        @DisplayName("re-running a tool on a document keeps the step before it")
        void repeatedStepCollapses() {
            when(usageRepository.incrementCount(PRINCIPAL, "ocr", "compress", TODAY, 1))
                    .thenReturn(1);
            when(chainRepository.incrementCount(PRINCIPAL, "ocr>compress", TODAY, 1)).thenReturn(1);

            service.recordUsage(
                    PRINCIPAL, "compress", chains(List.of("ocr", "compress", "compress")));

            verify(usageRepository).incrementCount(PRINCIPAL, "ocr", "compress", TODAY, 1);
            verify(chainRepository).incrementCount(PRINCIPAL, "ocr>compress", TODAY, 1);
        }

        @Test
        @DisplayName("a document whose only step was this tool records no self-transition")
        void noSelfTransition() {
            when(usageRepository.incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1))
                    .thenReturn(1);

            service.recordUsage(PRINCIPAL, "compare", chains(List.of("compare")));

            verify(usageRepository).incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1);
            verifyNoInteractions(chainRepository);
        }

        @Test
        @DisplayName("several inputs still count as one run of the tool")
        void multiInputCountsOnce() {
            when(usageRepository.incrementCount(
                            anyString(), anyString(), anyString(), anyLong(), anyLong()))
                    .thenReturn(1);
            when(chainRepository.incrementCount(anyString(), anyString(), anyLong(), anyLong()))
                    .thenReturn(1);

            service.recordUsage(
                    PRINCIPAL, "merge", chains(List.of("compress"), List.of("ocr", "rotate")));

            verify(usageRepository, times(1))
                    .incrementCount(anyString(), anyString(), anyString(), anyLong(), anyLong());
        }

        @Test
        @DisplayName("the longest input chain supplies the transition for a multi-input run")
        void multiInputCreditsDominantDocument() {
            when(usageRepository.incrementCount(PRINCIPAL, "rotate", "merge", TODAY, 1))
                    .thenReturn(1);
            when(chainRepository.incrementCount(anyString(), anyString(), anyLong(), anyLong()))
                    .thenReturn(1);

            service.recordUsage(
                    PRINCIPAL, "merge", chains(List.of("compress"), List.of("ocr", "rotate")));

            verify(usageRepository).incrementCount(PRINCIPAL, "rotate", "merge", TODAY, 1);
        }

        @Test
        @DisplayName("equal-length input chains break the tie deterministically")
        void multiInputTieIsStable() {
            when(usageRepository.incrementCount(PRINCIPAL, "compress", "merge", TODAY, 1))
                    .thenReturn(1);
            when(chainRepository.incrementCount(anyString(), anyString(), anyLong(), anyLong()))
                    .thenReturn(1);

            service.recordUsage(PRINCIPAL, "merge", chains(List.of("ocr"), List.of("compress")));
            service.recordUsage(PRINCIPAL, "merge", chains(List.of("compress"), List.of("ocr")));

            verify(usageRepository, times(2))
                    .incrementCount(PRINCIPAL, "compress", "merge", TODAY, 1);
        }

        @Test
        @DisplayName("the day's first run inserts the row")
        void insertsFirstRunOfDay() {
            when(usageRepository.incrementCount(PRINCIPAL, "compare", "ocr", TODAY, 1))
                    .thenReturn(0);
            when(chainRepository.incrementCount(PRINCIPAL, "compare>ocr", TODAY, 1)).thenReturn(1);

            service.recordUsage(PRINCIPAL, "ocr", chains(List.of("compare")));

            verify(usageRepository).insertCount(PRINCIPAL, "compare", "ocr", TODAY, 1);
        }

        @Test
        @DisplayName("the insert never goes through save(), which would merge over a live row")
        void insertDoesNotUseSave() {
            when(usageRepository.incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1))
                    .thenReturn(0);

            service.recordUsage(PRINCIPAL, "compare", FRESH);

            verify(usageRepository, never()).save(any(ToolUsageStat.class));
        }

        @Test
        @DisplayName("a concurrent insert falls back to incrementing the winner's row")
        void insertRaceFallsBackToUpdate() {
            when(usageRepository.incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1))
                    .thenReturn(0)
                    .thenReturn(1);
            doThrow(new DataIntegrityViolationException("duplicate key"))
                    .when(usageRepository)
                    .insertCount(PRINCIPAL, NONE, "compare", TODAY, 1);

            service.recordUsage(PRINCIPAL, "compare", FRESH);

            verify(usageRepository, times(2)).incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1);
        }

        @Test
        @DisplayName("a database failure never propagates to the caller")
        void databaseFailureSwallowed() {
            when(usageRepository.incrementCount(
                            anyString(), anyString(), anyString(), anyLong(), anyLong()))
                    .thenThrow(new RuntimeException("db down"));

            assertThatCode(() -> service.recordUsage(PRINCIPAL, "compare", FRESH))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("Recording chains")
    class RecordingChains {

        @BeforeEach
        void allowUsageWrites() {
            when(usageRepository.incrementCount(
                            anyString(), anyString(), anyString(), anyLong(), anyLong()))
                    .thenReturn(1);
        }

        @Test
        @DisplayName("the document's whole path is recorded, not just the last step")
        void recordsFullChain() {
            when(chainRepository.incrementCount(
                            PRINCIPAL, "compress>watermark>add-password", TODAY, 1))
                    .thenReturn(1);

            service.recordUsage(
                    PRINCIPAL, "add-password", chains(List.of("compress", "watermark")));

            verify(chainRepository)
                    .incrementCount(PRINCIPAL, "compress>watermark>add-password", TODAY, 1);
        }

        @Test
        @DisplayName("the day's first sighting of a chain inserts it with its length")
        void insertsFirstChainOfDay() {
            when(chainRepository.incrementCount(PRINCIPAL, "compress>ocr", TODAY, 1)).thenReturn(0);

            service.recordUsage(PRINCIPAL, "ocr", chains(List.of("compress")));

            verify(chainRepository).insertCount(PRINCIPAL, "compress>ocr", TODAY, 2, 1);
        }

        @Test
        @DisplayName("a concurrent chain insert falls back to incrementing the winner's row")
        void chainInsertRaceFallsBackToUpdate() {
            when(chainRepository.incrementCount(PRINCIPAL, "compress>ocr", TODAY, 1))
                    .thenReturn(0)
                    .thenReturn(1);
            doThrow(new DataIntegrityViolationException("duplicate key"))
                    .when(chainRepository)
                    .insertCount(PRINCIPAL, "compress>ocr", TODAY, 2, 1);

            service.recordUsage(PRINCIPAL, "ocr", chains(List.of("compress")));

            verify(chainRepository, times(2)).incrementCount(PRINCIPAL, "compress>ocr", TODAY, 1);
        }

        @Test
        @DisplayName("every distinct input document contributes its own chain")
        void recordsOneChainPerDocument() {
            when(chainRepository.incrementCount(anyString(), anyString(), anyLong(), anyLong()))
                    .thenReturn(1);

            service.recordUsage(
                    PRINCIPAL, "merge", chains(List.of("compress"), List.of("ocr", "rotate")));

            verify(chainRepository).incrementCount(PRINCIPAL, "compress>merge", TODAY, 1);
            verify(chainRepository).incrementCount(PRINCIPAL, "ocr>rotate>merge", TODAY, 1);
        }

        @Test
        @DisplayName("documents that took the same path count as one workflow")
        void deduplicatesIdenticalChains() {
            when(chainRepository.incrementCount(PRINCIPAL, "compress>merge", TODAY, 1))
                    .thenReturn(1);

            service.recordUsage(
                    PRINCIPAL,
                    "merge",
                    chains(List.of("compress"), List.of("compress"), List.of("compress")));

            verify(chainRepository, times(1)).incrementCount(PRINCIPAL, "compress>merge", TODAY, 1);
        }

        @Test
        @DisplayName("a single input document writes no more chains than it has paths")
        void boundsChainsPerEvent() {
            when(chainRepository.incrementCount(anyString(), anyString(), anyLong(), anyLong()))
                    .thenReturn(1);
            List<List<String>> many = new ArrayList<>();
            for (int i = 0; i < ToolUsageTrackingService.MAX_CHAINS_PER_EVENT + 5; i++) {
                many.add(List.of("tool-" + i));
            }

            service.recordUsage(PRINCIPAL, "merge", many);

            verify(chainRepository, times(ToolUsageTrackingService.MAX_CHAINS_PER_EVENT))
                    .incrementCount(anyString(), anyString(), anyLong(), anyLong());
        }

        @Test
        @DisplayName("a long-running document is recorded as its trailing window")
        void keepsTrailingWindowOfLongChains() {
            when(chainRepository.incrementCount(anyString(), anyString(), anyLong(), anyLong()))
                    .thenReturn(1);
            List<String> prior =
                    List.of("t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10");

            service.recordUsage(PRINCIPAL, "ocr", chains(prior));

            verify(chainRepository)
                    .incrementCount(PRINCIPAL, "t4>t5>t6>t7>t8>t9>t10>ocr", TODAY, 1);
        }

        @Test
        @DisplayName("the trailing window never outgrows the key column")
        void trailingWindowFitsTheColumn() {
            when(chainRepository.incrementCount(anyString(), anyString(), anyLong(), anyLong()))
                    .thenReturn(1);
            List<String> prior = Collections.nCopies(20, "a".repeat(64));

            service.recordUsage(PRINCIPAL, "ocr", chains(prior));

            verify(chainRepository)
                    .incrementCount(
                            anyString(),
                            argThat(key -> key.length() <= ToolChainStat.MAX_CHAIN_KEY_LENGTH),
                            anyLong(),
                            anyLong());
        }

        @Test
        @DisplayName("junk steps are dropped without losing the rest of the chain")
        void dropsInvalidSteps() {
            when(chainRepository.incrementCount(PRINCIPAL, "compress>ocr", TODAY, 1)).thenReturn(1);

            service.recordUsage(
                    PRINCIPAL, "ocr", chains(Arrays.asList("compress", "not a tool!", null)));

            verify(chainRepository).incrementCount(PRINCIPAL, "compress>ocr", TODAY, 1);
        }
    }

    @Nested
    @DisplayName("Validation and gating")
    class ValidationAndGating {

        @Test
        @DisplayName("invalid principals and tool keys are dropped")
        void invalidInputDropped() {
            service.recordUsage(PRINCIPAL, "not a tool!", FRESH);
            service.recordUsage(PRINCIPAL, null, FRESH);
            service.recordUsage(PRINCIPAL, "a".repeat(65), FRESH);
            service.recordUsage(null, "compare", FRESH);

            verifyNoInteractions(usageRepository, chainRepository);
        }

        @Test
        @DisplayName("a missing chain list is treated as a fresh document")
        void nullChainsKeepTheRun() {
            when(usageRepository.incrementCount(PRINCIPAL, NONE, "ocr", TODAY, 1)).thenReturn(1);

            service.recordUsage(PRINCIPAL, "ocr", null);

            verify(usageRepository).incrementCount(PRINCIPAL, NONE, "ocr", TODAY, 1);
            verifyNoInteractions(chainRepository);
        }

        @Test
        @DisplayName("an all-invalid chain drops the edge but keeps the run")
        void invalidPreviousKeepsRun() {
            when(usageRepository.incrementCount(PRINCIPAL, NONE, "ocr", TODAY, 1)).thenReturn(1);

            service.recordUsage(PRINCIPAL, "ocr", chains(List.of("bad key!")));

            verify(usageRepository).incrementCount(PRINCIPAL, NONE, "ocr", TODAY, 1);
            verifyNoInteractions(chainRepository);
        }

        @Test
        @DisplayName("disabled feature records nothing")
        void disabledFeatureRecordsNothing() {
            properties.getToolRecommendations().setEnabled(false);

            service.recordUsage(PRINCIPAL, "compare", chains(List.of("merge")));

            verifyNoInteractions(usageRepository, chainRepository);
        }

        @Test
        @DisplayName("no analytics consent records nothing, even with the feature enabled")
        void withheldAnalyticsConsentRecordsNothing() {
            properties.getSystem().setEnableAnalytics(null);
            service.recordUsage(PRINCIPAL, "compare", chains(List.of("merge")));

            properties.getSystem().setEnableAnalytics(false);
            service.recordUsage(PRINCIPAL, "compare", chains(List.of("merge")));

            assertThat(properties.getToolRecommendations().isEnabled()).isTrue();
            verifyNoInteractions(usageRepository, chainRepository);
        }

        @Test
        @DisplayName("valid keys accept letters, digits, hyphens and underscores")
        void keyValidation() {
            assertThat(ToolUsageTrackingService.isValidToolKey("pdfTextEditor")).isTrue();
            assertThat(ToolUsageTrackingService.isValidToolKey("pdf-to-img_2")).isTrue();
            assertThat(ToolUsageTrackingService.isValidToolKey("")).isFalse();
            assertThat(ToolUsageTrackingService.isValidToolKey("has space")).isFalse();
            assertThat(ToolUsageTrackingService.isValidToolKey("semi;colon")).isFalse();
        }

        @Test
        @DisplayName("the chain separator can never appear inside a tool key")
        void separatorIsNotAValidToolKeyCharacter() {
            assertThat(ToolUsageTrackingService.isValidToolKey("a" + ToolChainStat.SEPARATOR + "b"))
                    .isFalse();
        }

        @Test
        @DisplayName("the no-previous-tool sentinel can never collide with a real tool key")
        void sentinelIsNotAValidToolKey() {
            assertThat(ToolUsageTrackingService.isValidToolKey(ToolUsageStat.NO_PREVIOUS_TOOL))
                    .isFalse();
        }
    }

    @Nested
    @DisplayName("Retention")
    class Retention {

        @Test
        @DisplayName("the sweep deletes rows older than the configured window from both tables")
        void sweepDeletesOldRows() {
            properties.getToolRecommendations().setRetentionDays(90);

            service.cleanupOldStats();

            verify(usageRepository).deleteOlderThan(TODAY - 90);
            verify(chainRepository).deleteOlderThan(TODAY - 90);
        }

        @Test
        @DisplayName("non-positive retention disables the sweep")
        void nonPositiveRetentionSkipsSweep() {
            properties.getToolRecommendations().setRetentionDays(0);

            service.cleanupOldStats();

            verify(usageRepository, never()).deleteOlderThan(anyLong());
            verify(chainRepository, never()).deleteOlderThan(anyLong());
        }

        @Test
        @DisplayName("a failing delete is logged, not thrown")
        void sweepFailureIsSwallowed() {
            when(usageRepository.deleteOlderThan(anyLong()))
                    .thenThrow(new RuntimeException("db down"));

            assertThatCode(() -> service.cleanupOldStats()).doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("Chain keys")
    class ChainKeys {

        @Test
        @DisplayName("a chain key round-trips through its tool list")
        void roundTrips() {
            List<String> tools = List.of("compress", "watermark", "add-password");

            assertThat(ToolChainStat.fromChainKey(ToolChainStat.toChainKey(tools)))
                    .isEqualTo(tools);
        }

        @Test
        @DisplayName("a full-length chain of maximum-length tool keys still fits the key column")
        void maxChainFitsTheKeyColumn() {
            // Pins the sizing relationship: anything that passes validation must be storable,
            // so the oversized-chain guard stays unreachable for legitimate input.
            List<String> tools = Collections.nCopies(ToolChainStat.MAX_CHAIN_TOOLS, "a".repeat(64));

            assertThat(ToolChainStat.toChainKey(tools).length())
                    .isLessThanOrEqualTo(ToolChainStat.MAX_CHAIN_KEY_LENGTH);
        }

        @Test
        @DisplayName("an empty key is no chain at all")
        void emptyKey() {
            assertThat(ToolChainStat.fromChainKey("")).isEmpty();
            assertThat(ToolChainStat.fromChainKey(null)).isEmpty();
        }
    }
}
