package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.ToolUsageStat;
import stirling.software.proprietary.repository.ToolUsageStatRepository;

@ExtendWith(MockitoExtension.class)
class ToolUsageTrackingServiceTest {

    private static final String PRINCIPAL = "alice";
    private static final String NONE = ToolUsageStat.NO_PREVIOUS_TOOL;
    private static final long TODAY = ToolUsageTrackingService.currentEpochDay();

    @Mock private ToolUsageStatRepository usageRepository;

    private ApplicationProperties properties;
    private ToolUsageTrackingService service;

    @BeforeEach
    void setUp() {
        properties = new ApplicationProperties();
        properties.getSystem().setEnableAnalytics(true);
        service = new ToolUsageTrackingService(usageRepository, properties);
    }

    @Nested
    @DisplayName("Recording")
    class Recording {

        @Test
        @DisplayName("a run with no predecessor increments the no-previous-tool row")
        void recordsPlainRun() {
            when(usageRepository.incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1))
                    .thenReturn(1);

            service.recordUsage(PRINCIPAL, "compare", null);

            verify(usageRepository).incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1);
        }

        @Test
        @DisplayName("the previous tool is stored as the transition edge")
        void recordsTransitionEdge() {
            when(usageRepository.incrementCount(PRINCIPAL, "compare", "ocr", TODAY, 1))
                    .thenReturn(1);

            service.recordUsage(PRINCIPAL, "ocr", "compare");

            verify(usageRepository).incrementCount(PRINCIPAL, "compare", "ocr", TODAY, 1);
        }

        @Test
        @DisplayName("running the same tool twice records no self-transition")
        void noSelfTransition() {
            when(usageRepository.incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1))
                    .thenReturn(1);

            service.recordUsage(PRINCIPAL, "compare", "compare");

            verify(usageRepository).incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1);
        }

        @Test
        @DisplayName("the day's first run inserts the row")
        void insertsFirstRunOfDay() {
            when(usageRepository.incrementCount(PRINCIPAL, "compare", "ocr", TODAY, 1))
                    .thenReturn(0);

            service.recordUsage(PRINCIPAL, "ocr", "compare");

            verify(usageRepository).insertCount(PRINCIPAL, "compare", "ocr", TODAY, 1);
        }

        @Test
        @DisplayName("the insert never goes through save(), which would merge over a live row")
        void insertDoesNotUseSave() {
            when(usageRepository.incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1))
                    .thenReturn(0);

            service.recordUsage(PRINCIPAL, "compare", null);

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

            service.recordUsage(PRINCIPAL, "compare", null);

            verify(usageRepository, times(2)).incrementCount(PRINCIPAL, NONE, "compare", TODAY, 1);
        }

        @Test
        @DisplayName("a database failure never propagates to the caller")
        void databaseFailureSwallowed() {
            when(usageRepository.incrementCount(
                            anyString(), anyString(), anyString(), anyLong(), anyLong()))
                    .thenThrow(new RuntimeException("db down"));

            assertThatCode(() -> service.recordUsage(PRINCIPAL, "compare", null))
                    .doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("Validation and gating")
    class ValidationAndGating {

        @Test
        @DisplayName("invalid principals and tool keys are dropped")
        void invalidInputDropped() {
            service.recordUsage(PRINCIPAL, "not a tool!", null);
            service.recordUsage(PRINCIPAL, null, null);
            service.recordUsage(PRINCIPAL, "a".repeat(65), null);
            service.recordUsage(null, "compare", null);

            verifyNoInteractions(usageRepository);
        }

        @Test
        @DisplayName("an invalid previous tool drops the edge but keeps the run")
        void invalidPreviousKeepsRun() {
            when(usageRepository.incrementCount(PRINCIPAL, NONE, "ocr", TODAY, 1)).thenReturn(1);

            service.recordUsage(PRINCIPAL, "ocr", "bad key!");

            verify(usageRepository).incrementCount(PRINCIPAL, NONE, "ocr", TODAY, 1);
        }

        @Test
        @DisplayName("disabled feature records nothing")
        void disabledFeatureRecordsNothing() {
            properties.getToolRecommendations().setEnabled(false);

            service.recordUsage(PRINCIPAL, "compare", "merge");

            verifyNoInteractions(usageRepository);
        }

        @Test
        @DisplayName("no analytics consent records nothing, even with the feature enabled")
        void withheldAnalyticsConsentRecordsNothing() {
            properties.getSystem().setEnableAnalytics(null);
            service.recordUsage(PRINCIPAL, "compare", "merge");

            properties.getSystem().setEnableAnalytics(false);
            service.recordUsage(PRINCIPAL, "compare", "merge");

            assertThat(properties.getToolRecommendations().isEnabled()).isTrue();
            verifyNoInteractions(usageRepository);
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
        @DisplayName("the sweep deletes rows older than the configured window")
        void sweepDeletesOldRows() {
            properties.getToolRecommendations().setRetentionDays(90);

            service.cleanupOldStats();

            verify(usageRepository).deleteOlderThan(TODAY - 90);
        }

        @Test
        @DisplayName("non-positive retention disables the sweep")
        void nonPositiveRetentionSkipsSweep() {
            properties.getToolRecommendations().setRetentionDays(0);

            service.cleanupOldStats();

            verify(usageRepository, never()).deleteOlderThan(anyLong());
        }

        @Test
        @DisplayName("a failing delete is logged, not thrown")
        void sweepFailureIsSwallowed() {
            when(usageRepository.deleteOlderThan(anyLong()))
                    .thenThrow(new RuntimeException("db down"));

            assertThatCode(() -> service.cleanupOldStats()).doesNotThrowAnyException();
        }
    }
}
