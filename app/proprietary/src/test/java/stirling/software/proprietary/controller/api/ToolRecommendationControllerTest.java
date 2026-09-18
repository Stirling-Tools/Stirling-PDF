package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.controller.api.ToolRecommendationController.RecommendationsResponse;
import stirling.software.proprietary.controller.api.ToolRecommendationController.UsageRequest;
import stirling.software.proprietary.service.ToolRecommendationService;
import stirling.software.proprietary.service.ToolRecommendationService.ToolRecommendation;
import stirling.software.proprietary.service.ToolUsageTrackingService;

@ExtendWith(MockitoExtension.class)
class ToolRecommendationControllerTest {

    private static final String BASE_PATH = "/api/v1/proprietary/ui-data/tool-recommendations";

    /** One input document that has already been through compress. */
    private static final List<List<String>> CHAIN = List.of(List.of("compress"));

    private static final List<List<String>> JUNK_CHAIN = List.of(List.of("bad key!"));

    @Mock private ToolUsageTrackingService trackingService;
    @Mock private ToolRecommendationService recommendationService;
    @Mock private UserServiceInterface userService;

    private ToolRecommendationController controller;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        controller =
                new ToolRecommendationController(
                        trackingService, recommendationService, Optional.of(userService));
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
        // Lenient: the 400 case is rejected before either gate is consulted.
        lenient().when(trackingService.isRecordingEnabled()).thenReturn(true);
        lenient().when(trackingService.isKnownToolKey(anyString())).thenReturn(true);
        lenient().when(trackingService.isKnownToolKey("bad key!")).thenReturn(false);
        lenient().when(trackingService.isKnownToolKey("not a tool!")).thenReturn(false);
        lenient().when(trackingService.isKnownToolKey(isNull())).thenReturn(false);
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
                    controller.getRecommendations("compare", 6);

            assertThat(response.getStatusCode().value()).isEqualTo(200);
            assertThat(response.getBody().recommendations())
                    .containsExactly(new ToolRecommendation("ocr", 5.0));
        }

        @Test
        @DisplayName("a currentTool no tool answers to is treated as no context, not an error")
        void unknownCurrentToolIgnored() {
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(recommendationService.getRecommendations(eq("alice"), isNull(), anyInt()))
                    .thenReturn(List.of());

            ResponseEntity<RecommendationsResponse> response =
                    controller.getRecommendations("not a tool!", 6);

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
                    controller.getRecommendations(null, 6);

            assertThat(response.getStatusCode().value()).isEqualTo(200);
            assertThat(response.getBody().recommendations()).isEmpty();
        }

        @Test
        @DisplayName("with nobody signed in it answers 501 so the client stops asking")
        void noPrincipalReturns501() {
            when(userService.getCurrentUsername()).thenReturn(null);

            ResponseEntity<RecommendationsResponse> response =
                    controller.getRecommendations("compare", 6);

            assertThat(response.getStatusCode().value()).isEqualTo(501);
            verifyNoInteractions(recommendationService);
        }

        @Test
        @DisplayName("an install that declined tracking answers 501 rather than an empty ranking")
        void declinedInstallReturns501() {
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(trackingService.isRecordingEnabled()).thenReturn(false);

            ResponseEntity<RecommendationsResponse> response =
                    controller.getRecommendations("compare", 6);

            assertThat(response.getStatusCode().value()).isEqualTo(501);
            verifyNoInteractions(recommendationService);
        }
    }

    @Nested
    @DisplayName("POST usage")
    class RecordUsage {

        @Test
        @DisplayName("valid events are recorded for the signed-in user")
        void recordsUsage() {
            when(userService.getCurrentUsername()).thenReturn("alice");

            ResponseEntity<Void> response = controller.recordUsage(new UsageRequest("ocr", CHAIN));

            assertThat(response.getStatusCode().value()).isEqualTo(204);
            verify(trackingService).recordUsage("alice", "ocr", CHAIN);
        }

        @Test
        @DisplayName("a tool key no tool answers to is rejected with 400")
        void unknownToolKeyRejected() {
            ResponseEntity<Void> response =
                    controller.recordUsage(new UsageRequest("bad key!", null));

            assertThat(response.getStatusCode().value()).isEqualTo(400);
            verify(trackingService, never()).recordUsage(anyString(), anyString(), any());
        }

        @Test
        @DisplayName("chains are passed through for the service to validate")
        void chainsPassedThrough() {
            when(userService.getCurrentUsername()).thenReturn("alice");

            controller.recordUsage(new UsageRequest("ocr", JUNK_CHAIN));

            verify(trackingService).recordUsage("alice", "ocr", JUNK_CHAIN);
        }

        @Test
        @DisplayName("an install that declined tracking answers 501 so the client stops posting")
        void declinedInstallReturns501() {
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(trackingService.isRecordingEnabled()).thenReturn(false);

            ResponseEntity<Void> response = controller.recordUsage(new UsageRequest("ocr", CHAIN));

            assertThat(response.getStatusCode().value()).isEqualTo(501);
            verify(trackingService, never()).recordUsage(anyString(), anyString(), any());
        }
    }

    @Nested
    @DisplayName("Cross-principal exposure")
    class CrossPrincipalExposure {

        /** The chain queries carry no tenant predicate, so no HTTP route may reach them. */
        @Test
        @DisplayName("no route serves other principals' chains")
        void workflowsRouteIsGone() throws Exception {
            mockMvc.perform(get(BASE_PATH + "/workflows").param("minLength", "2"))
                    .andExpect(status().isNotFound());

            verifyNoInteractions(recommendationService);
        }
    }

    @Nested
    @DisplayName("Principal resolution")
    class PrincipalResolution {

        /**
         * Rows key on a username the server authenticated. With login disabled the only identity a
         * caller could offer is one they declared, which would let an unauthenticated client mint
         * principals to write rows under - so nothing is recorded at all.
         */
        @Test
        @DisplayName("no login means nothing is recorded")
        void noLoginRecordsNothing() {
            when(userService.getCurrentUsername()).thenReturn(null);

            ResponseEntity<Void> response = controller.recordUsage(new UsageRequest("ocr", CHAIN));

            assertThat(response.getStatusCode().value()).isEqualTo(501);
            verify(trackingService, never()).recordUsage(anyString(), anyString(), any());
        }

        @Test
        @DisplayName("Spring's anonymousUser placeholder is not treated as a username")
        void anonymousUserPlaceholderIgnored() {
            when(userService.getCurrentUsername()).thenReturn("anonymousUser");

            ResponseEntity<Void> response = controller.recordUsage(new UsageRequest("ocr", CHAIN));

            assertThat(response.getStatusCode().value()).isEqualTo(501);
            verify(trackingService, never()).recordUsage(anyString(), anyString(), any());
        }

        @Test
        @DisplayName("a core build with no user service records nothing")
        void withoutUserServiceRecordsNothing() {
            ToolRecommendationController coreController =
                    new ToolRecommendationController(
                            trackingService, recommendationService, Optional.empty());

            ResponseEntity<Void> response =
                    coreController.recordUsage(new UsageRequest("ocr", CHAIN));

            assertThat(response.getStatusCode().value()).isEqualTo(501);
            verify(trackingService, never()).recordUsage(anyString(), anyString(), any());
        }
    }
}
