package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.controller.api.ToolRecommendationController.RecommendationsResponse;
import stirling.software.proprietary.controller.api.ToolRecommendationController.UsageRequest;
import stirling.software.proprietary.controller.api.ToolRecommendationController.WorkflowsResponse;
import stirling.software.proprietary.service.ToolRecommendationService;
import stirling.software.proprietary.service.ToolRecommendationService.ToolRecommendation;
import stirling.software.proprietary.service.ToolRecommendationService.ToolWorkflow;
import stirling.software.proprietary.service.ToolRecommendationService.WorkflowScope;
import stirling.software.proprietary.service.ToolUsageTrackingService;

@ExtendWith(MockitoExtension.class)
class ToolRecommendationControllerTest {

    private static final String BROWSER_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

    /** One input document that has already been through compress. */
    private static final List<List<String>> CHAIN = List.of(List.of("compress"));

    private static final List<List<String>> JUNK_CHAIN = List.of(List.of("bad key!"));

    @Mock private ToolUsageTrackingService trackingService;
    @Mock private ToolRecommendationService recommendationService;
    @Mock private UserServiceInterface userService;

    private ToolRecommendationController controller;

    @BeforeEach
    void setUp() {
        controller =
                new ToolRecommendationController(
                        trackingService, recommendationService, Optional.of(userService));
    }

    @Nested
    @DisplayName("GET recommendations")
    class GetRecommendations {

        @Test
        @DisplayName("returns the service's ranking for the logged-in user")
        void returnsRanking() {
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(recommendationService.getRecommendations("alice", "compare", 6))
                    .thenReturn(List.of(new ToolRecommendation("ocr", 5.0)));

            ResponseEntity<RecommendationsResponse> response =
                    controller.getRecommendations("compare", 6, null);

            assertThat(response.getStatusCode().value()).isEqualTo(200);
            assertThat(response.getBody().recommendations())
                    .containsExactly(new ToolRecommendation("ocr", 5.0));
        }

        @Test
        @DisplayName("an invalid currentTool is treated as no context, not an error")
        void invalidCurrentToolIgnored() {
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(recommendationService.getRecommendations(eq("alice"), isNull(), anyInt()))
                    .thenReturn(List.of());

            ResponseEntity<RecommendationsResponse> response =
                    controller.getRecommendations("not a tool!", 6, null);

            assertThat(response.getStatusCode().value()).isEqualTo(200);
            verify(recommendationService).getRecommendations("alice", null, 6);
        }

        @Test
        @DisplayName("a service failure degrades to an empty list, never an error page")
        void serviceFailureDegrades() {
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(recommendationService.getRecommendations(anyString(), isNull(), anyInt()))
                    .thenThrow(new RuntimeException("db down"));

            ResponseEntity<RecommendationsResponse> response =
                    controller.getRecommendations(null, 6, null);

            assertThat(response.getStatusCode().value()).isEqualTo(200);
            assertThat(response.getBody().recommendations()).isEmpty();
        }
    }

    @Nested
    @DisplayName("POST usage")
    class RecordUsage {

        @Test
        @DisplayName("valid events are recorded for the resolved principal")
        void recordsUsage() {
            when(userService.getCurrentUsername()).thenReturn("alice");

            ResponseEntity<Void> response =
                    controller.recordUsage(new UsageRequest("ocr", CHAIN), null);

            assertThat(response.getStatusCode().value()).isEqualTo(204);
            verify(trackingService).recordUsage("alice", "ocr", CHAIN);
        }

        @Test
        @DisplayName("an invalid tool key is rejected with 400")
        void invalidToolKeyRejected() {
            ResponseEntity<Void> response =
                    controller.recordUsage(new UsageRequest("bad key!", null), null);

            assertThat(response.getStatusCode().value()).isEqualTo(400);
            verifyNoInteractions(trackingService);
        }

        @Test
        @DisplayName("chains are passed through for the service to validate")
        void chainsPassedThrough() {
            when(userService.getCurrentUsername()).thenReturn("alice");

            controller.recordUsage(new UsageRequest("ocr", JUNK_CHAIN), null);

            verify(trackingService).recordUsage("alice", "ocr", JUNK_CHAIN);
        }
    }

    @Nested
    @DisplayName("GET workflows")
    class GetWorkflows {

        @Test
        @DisplayName("returns the repeated workflows for the resolved principal")
        void returnsWorkflows() {
            when(userService.getCurrentUsername()).thenReturn("alice");
            ToolWorkflow workflow =
                    new ToolWorkflow(List.of("compress", "ocr"), 4, WorkflowScope.USER);
            when(recommendationService.getWorkflows("alice", 2, 6)).thenReturn(List.of(workflow));

            ResponseEntity<WorkflowsResponse> response = controller.getWorkflows(2, 6, null);

            assertThat(response.getBody().workflows()).containsExactly(workflow);
        }

        @Test
        @DisplayName("a failure degrades to an empty list rather than breaking the caller")
        void failureDegrades() {
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(recommendationService.getWorkflows(anyString(), anyInt(), anyInt()))
                    .thenThrow(new RuntimeException("db down"));

            ResponseEntity<WorkflowsResponse> response = controller.getWorkflows(2, 6, null);

            assertThat(response.getStatusCode().value()).isEqualTo(200);
            assertThat(response.getBody().workflows()).isEmpty();
        }
    }

    @Nested
    @DisplayName("Principal resolution")
    class PrincipalResolution {

        @Test
        @DisplayName("no login falls back to the browser id pseudo-identity")
        void browserIdFallback() {
            when(userService.getCurrentUsername()).thenReturn(null);

            controller.recordUsage(new UsageRequest("ocr", null), BROWSER_ID);

            verify(trackingService).recordUsage("anon:" + BROWSER_ID, "ocr", null);
        }

        @Test
        @DisplayName("a malformed browser id falls back to the shared anonymous bucket")
        void malformedBrowserIdFallback() {
            when(userService.getCurrentUsername()).thenReturn(null);

            controller.recordUsage(new UsageRequest("ocr", null), "<script>alert(1)</script>");

            verify(trackingService).recordUsage("anonymous", "ocr", null);
        }

        @Test
        @DisplayName("Spring's anonymousUser placeholder is not treated as a username")
        void anonymousUserPlaceholderIgnored() {
            when(userService.getCurrentUsername()).thenReturn("anonymousUser");

            controller.recordUsage(new UsageRequest("ocr", null), BROWSER_ID);

            verify(trackingService).recordUsage("anon:" + BROWSER_ID, "ocr", null);
        }
    }
}
