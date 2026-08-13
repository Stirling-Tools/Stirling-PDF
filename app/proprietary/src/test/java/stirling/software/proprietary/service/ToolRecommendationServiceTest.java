package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.model.ToolRecommendationDismissal;
import stirling.software.proprietary.model.ToolRecommendationDismissalId;
import stirling.software.proprietary.repository.ToolRecommendationDismissalRepository;
import stirling.software.proprietary.service.ToolRecommendationService.ToolRecommendation;
import stirling.software.proprietary.service.ToolUsageSignalService.TeamScope;

@ExtendWith(MockitoExtension.class)
class ToolRecommendationServiceTest {

    private static final String PRINCIPAL = "alice";
    private static final TeamScope TEAM = new TeamScope(7L, List.of("bob", "carol"));

    @Mock private ToolUsageSignalService signalService;
    @Mock private ToolRecommendationDismissalRepository dismissalRepository;

    private ApplicationProperties properties;
    private ToolRecommendationService service;

    @BeforeEach
    void setUp() {
        properties = new ApplicationProperties();
        properties.getSystem().setEnableAnalytics(true);
        service = new ToolRecommendationService(signalService, dismissalRepository, properties);
        lenient().when(dismissalRepository.findByPrincipal(anyString())).thenReturn(List.of());
        lenient().when(signalService.resolveTeamScope(anyString())).thenReturn(TeamScope.none());
        lenient()
                .when(signalService.userFrequency(anyString(), anyLong(), anyLong()))
                .thenReturn(Map.of());
        lenient().when(signalService.globalFrequency(anyLong(), anyLong())).thenReturn(Map.of());
        lenient()
                .when(signalService.userTransitions(anyString(), anyString(), anyLong(), anyLong()))
                .thenReturn(Map.of());
        lenient()
                .when(signalService.globalTransitions(anyString(), anyLong(), anyLong()))
                .thenReturn(Map.of());
        lenient()
                .when(signalService.teamFrequency(any(TeamScope.class), anyLong(), anyLong()))
                .thenReturn(Map.of());
        lenient()
                .when(
                        signalService.teamTransitions(
                                any(TeamScope.class), anyString(), anyLong(), anyLong()))
                .thenReturn(Map.of());
    }

    private static List<String> toolKeys(List<ToolRecommendation> recommendations) {
        return recommendations.stream().map(ToolRecommendation::toolKey).toList();
    }

    @Nested
    @DisplayName("Scoring")
    class Scoring {

        @Test
        @DisplayName("transitions from the current tool outrank plain usage frequency")
        void transitionsOutrankFrequency() {
            when(signalService.userTransitions(eq(PRINCIPAL), eq("compare"), anyLong(), anyLong()))
                    .thenReturn(Map.of("ocr", 8.0));
            when(signalService.userFrequency(eq(PRINCIPAL), anyLong(), anyLong()))
                    .thenReturn(Map.of("merge", 150.0, "ocr", 3.0));

            List<ToolRecommendation> result = service.getRecommendations(PRINCIPAL, "compare", 6);

            assertThat(toolKeys(result)).containsExactly("ocr", "merge");
        }

        @Test
        @DisplayName("the user's own signal outranks an equally strong global signal")
        void userSignalOutranksGlobal() {
            when(signalService.userFrequency(eq(PRINCIPAL), anyLong(), anyLong()))
                    .thenReturn(Map.of("split", 6.0));
            when(signalService.globalFrequency(anyLong(), anyLong()))
                    .thenReturn(Map.of("compress", 6.0));

            List<ToolRecommendation> result = service.getRecommendations(PRINCIPAL, null, 6);

            assertThat(toolKeys(result)).containsExactly("split", "compress");
        }

        @Test
        @DisplayName("normalization stops huge global counts from swamping personal patterns")
        void globalCountsAreNormalized() {
            // Whole install uses compress a million times; the user personally always
            // reaches for OCR after compare. OCR must still win.
            when(signalService.userTransitions(eq(PRINCIPAL), eq("compare"), anyLong(), anyLong()))
                    .thenReturn(Map.of("ocr", 15.0));
            when(signalService.globalFrequency(anyLong(), anyLong()))
                    .thenReturn(Map.of("compress", 1_500_000.0));

            List<ToolRecommendation> result = service.getRecommendations(PRINCIPAL, "compare", 6);

            assertThat(toolKeys(result)).containsExactly("ocr", "compress");
        }

        @Test
        @DisplayName("team signals rank between personal and install-wide ones")
        void teamSignalsRankBetween() {
            when(signalService.resolveTeamScope(PRINCIPAL)).thenReturn(TEAM);
            when(signalService.userFrequency(eq(PRINCIPAL), anyLong(), anyLong()))
                    .thenReturn(Map.of("split", 5.0));
            when(signalService.teamFrequency(eq(TEAM), anyLong(), anyLong()))
                    .thenReturn(Map.of("merge", 5.0));
            when(signalService.globalFrequency(anyLong(), anyLong()))
                    .thenReturn(Map.of("compress", 5.0));

            List<ToolRecommendation> result = service.getRecommendations(PRINCIPAL, null, 6);

            assertThat(toolKeys(result)).containsExactly("split", "merge", "compress");
        }

        @Test
        @DisplayName("no team queries run for a user without teammates")
        void teamQueriesSkippedWithoutTeam() {
            service.getRecommendations(PRINCIPAL, "compare", 6);

            verify(signalService, never())
                    .teamFrequency(any(TeamScope.class), anyLong(), anyLong());
            verify(signalService, never())
                    .teamTransitions(any(TeamScope.class), anyString(), anyLong(), anyLong());
        }

        @Test
        @DisplayName("the current tool is never recommended back to the user")
        void currentToolExcluded() {
            when(signalService.userFrequency(eq(PRINCIPAL), anyLong(), anyLong()))
                    .thenReturn(Map.of("compare", 55.0, "ocr", 3.0));

            List<ToolRecommendation> result = service.getRecommendations(PRINCIPAL, "compare", 6);

            assertThat(toolKeys(result)).containsExactly("ocr");
        }

        @Test
        @DisplayName("limit caps the list; non-positive limit falls back to the default")
        void limitApplied() {
            when(signalService.userFrequency(eq(PRINCIPAL), anyLong(), anyLong()))
                    .thenReturn(
                            Map.of(
                                    "a", 9.0, "b", 8.0, "c", 7.0, "d", 6.0, "e", 5.0, "f", 4.0, "g",
                                    3.0, "h", 2.0));

            assertThat(service.getRecommendations(PRINCIPAL, null, 2)).hasSize(2);
            assertThat(service.getRecommendations(PRINCIPAL, null, 0))
                    .hasSize(ToolRecommendationService.DEFAULT_LIMIT);
            assertThat(service.getRecommendations(PRINCIPAL, null, 999)).hasSize(8);
        }

        @Test
        @DisplayName("no usage data at all produces an empty list (frontend falls back)")
        void coldStartReturnsEmpty() {
            assertThat(service.getRecommendations(PRINCIPAL, "compare", 6)).isEmpty();
        }

        @Test
        @DisplayName("disabled feature returns empty without touching any signal")
        void disabledFeatureShortCircuits() {
            properties.getToolRecommendations().setEnabled(false);

            assertThat(service.getRecommendations(PRINCIPAL, "compare", 6)).isEmpty();
            verifyNoInteractions(signalService, dismissalRepository);
        }

        @Test
        @DisplayName("no analytics consent returns empty without touching any signal")
        void withheldAnalyticsConsentShortCircuits() {
            properties.getSystem().setEnableAnalytics(null);

            assertThat(service.getRecommendations(PRINCIPAL, "compare", 6)).isEmpty();
            verifyNoInteractions(signalService, dismissalRepository);
        }

        @Test
        @DisplayName("no transition queries run when there is no current tool")
        void noTransitionQueriesWithoutContext() {
            service.getRecommendations(PRINCIPAL, null, 6);

            verify(signalService, never())
                    .userTransitions(anyString(), anyString(), anyLong(), anyLong());
            verify(signalService, never()).globalTransitions(anyString(), anyLong(), anyLong());
        }
    }

    @Nested
    @DisplayName("Dismissals")
    class Dismissals {

        @Test
        @DisplayName("a dismissal for the current context hides the tool")
        void contextDismissalFilters() {
            when(signalService.userFrequency(eq(PRINCIPAL), anyLong(), anyLong()))
                    .thenReturn(Map.of("ocr", 6.0, "merge", 5.0));
            when(dismissalRepository.findByPrincipal(PRINCIPAL))
                    .thenReturn(
                            List.of(new ToolRecommendationDismissal(PRINCIPAL, "compare", "ocr")));

            List<ToolRecommendation> result = service.getRecommendations(PRINCIPAL, "compare", 6);

            assertThat(toolKeys(result)).containsExactly("merge");
        }

        @Test
        @DisplayName("a dismissal for another context does not hide the tool")
        void unrelatedContextDismissalKept() {
            when(signalService.userFrequency(eq(PRINCIPAL), anyLong(), anyLong()))
                    .thenReturn(Map.of("ocr", 6.0));
            when(dismissalRepository.findByPrincipal(PRINCIPAL))
                    .thenReturn(
                            List.of(new ToolRecommendationDismissal(PRINCIPAL, "merge", "ocr")));

            List<ToolRecommendation> result = service.getRecommendations(PRINCIPAL, "compare", 6);

            assertThat(toolKeys(result)).containsExactly("ocr");
        }

        @Test
        @DisplayName("an any-context dismissal hides the tool everywhere")
        void anyContextDismissalFilters() {
            when(signalService.userFrequency(eq(PRINCIPAL), anyLong(), anyLong()))
                    .thenReturn(Map.of("ocr", 6.0));
            when(dismissalRepository.findByPrincipal(PRINCIPAL))
                    .thenReturn(
                            List.of(
                                    new ToolRecommendationDismissal(
                                            PRINCIPAL,
                                            ToolRecommendationDismissal.ANY_CONTEXT,
                                            "ocr")));

            assertThat(service.getRecommendations(PRINCIPAL, null, 6)).isEmpty();
            assertThat(service.getRecommendations(PRINCIPAL, "compare", 6)).isEmpty();
        }

        @Test
        @DisplayName("a dismissal takes effect on the very next read (nothing cached)")
        void dismissalAppliesImmediately() {
            when(signalService.userFrequency(eq(PRINCIPAL), anyLong(), anyLong()))
                    .thenReturn(Map.of("ocr", 6.0, "merge", 5.0));
            when(dismissalRepository.findByPrincipal(PRINCIPAL))
                    .thenReturn(List.of())
                    .thenReturn(
                            List.of(new ToolRecommendationDismissal(PRINCIPAL, "compare", "ocr")));

            assertThat(toolKeys(service.getRecommendations(PRINCIPAL, "compare", 6)))
                    .containsExactly("ocr", "merge");
            assertThat(toolKeys(service.getRecommendations(PRINCIPAL, "compare", 6)))
                    .containsExactly("merge");
        }

        @Test
        @DisplayName("dismiss saves the row keyed by principal, context and tool")
        void dismissSavesRow() {
            service.dismiss(PRINCIPAL, "compare", "ocr");

            ArgumentCaptor<ToolRecommendationDismissal> captor =
                    ArgumentCaptor.forClass(ToolRecommendationDismissal.class);
            verify(dismissalRepository).save(captor.capture());
            assertThat(captor.getValue().getPrincipal()).isEqualTo(PRINCIPAL);
            assertThat(captor.getValue().getContextTool()).isEqualTo("compare");
            assertThat(captor.getValue().getDismissedTool()).isEqualTo("ocr");
        }

        @Test
        @DisplayName("undoDismiss deletes the stored dismissal")
        void undoDismissDeletes() {
            ToolRecommendationDismissal stored =
                    new ToolRecommendationDismissal(PRINCIPAL, "compare", "ocr");
            when(dismissalRepository.findById(
                            new ToolRecommendationDismissalId(PRINCIPAL, "compare", "ocr")))
                    .thenReturn(Optional.of(stored));

            service.undoDismiss(PRINCIPAL, "compare", "ocr");

            verify(dismissalRepository).delete(stored);
        }

        @Test
        @DisplayName("undoing a dismissal that was never made is a no-op")
        void undoUnknownDismissalIsNoOp() {
            when(dismissalRepository.findById(
                            new ToolRecommendationDismissalId(PRINCIPAL, "compare", "ocr")))
                    .thenReturn(Optional.empty());

            service.undoDismiss(PRINCIPAL, "compare", "ocr");

            verify(dismissalRepository, never()).delete(any(ToolRecommendationDismissal.class));
        }
    }
}
