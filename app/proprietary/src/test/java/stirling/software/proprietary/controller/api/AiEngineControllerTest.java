package stirling.software.proprietary.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.TaskManager;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.model.api.ai.AiWorkflowOutcome;
import stirling.software.proprietary.model.api.ai.AiWorkflowRequest;
import stirling.software.proprietary.model.api.ai.AiWorkflowResponse;
import stirling.software.proprietary.model.api.ai.AiWorkflowResultFile;
import stirling.software.proprietary.service.AiEngineClient;
import stirling.software.proprietary.service.AiEngineEndpointResolver;
import stirling.software.proprietary.service.AiWorkflowService;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiEngineControllerTest {

    @Mock private AiEngineClient aiEngineClient;
    @Mock private AiWorkflowService aiWorkflowService;
    @Mock private TaskManager taskManager;
    @Mock private JobOwnershipService jobOwnershipService;
    @Mock private AiEngineEndpointResolver endpointResolver;
    @Mock private UserServiceInterface userService;

    // Real ObjectMapper so parseJson / withEnabledEndpoints exercise genuine JSON behaviour.
    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    // Synchronous executor so orchestrateStream runs its work inline on the calling thread.
    private final Executor inlineExecutor = Runnable::run;

    private AiEngineController controller;

    private AiEngineController newController(UserServiceInterface user) {
        AiEngineController c =
                new AiEngineController(
                        aiEngineClient,
                        aiWorkflowService,
                        objectMapper,
                        inlineExecutor,
                        taskManager,
                        jobOwnershipService,
                        endpointResolver,
                        user);
        // @Value field; no setter, so inject the default timeout used in production.
        ReflectionTestUtils.setField(c, "streamTimeoutMs", 1_800_000L);
        return c;
    }

    @BeforeEach
    void setUp() {
        controller = newController(userService);
    }

    @Nested
    @DisplayName("health()")
    class Health {

        @Test
        @DisplayName("returns 200 JSON body from the engine client with current user id")
        void healthReturnsEngineBody() throws IOException {
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(aiEngineClient.get("/health", "alice")).thenReturn("{\"status\":\"ok\"}");

            ResponseEntity<String> response = controller.health();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("{\"status\":\"ok\"}", response.getBody());
            assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());
            verify(aiEngineClient).get("/health", "alice");
        }

        @Test
        @DisplayName("passes a null user id when no UserServiceInterface bean is wired")
        void healthPassesNullUserWhenSecurityDisabled() throws IOException {
            AiEngineController noSecurity = newController(null);
            when(aiEngineClient.get("/health", null)).thenReturn("{}");

            ResponseEntity<String> response = noSecurity.health();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            verify(aiEngineClient).get("/health", null);
            verifyNoInteractions(userService);
        }

        @Test
        @DisplayName("propagates IOException from the engine client")
        void healthPropagatesIoException() throws IOException {
            when(userService.getCurrentUsername()).thenReturn("alice");
            when(aiEngineClient.get(eq("/health"), anyString()))
                    .thenThrow(new IOException("engine down"));

            assertThrows(IOException.class, () -> controller.health());
        }
    }

    @Nested
    @DisplayName("orchestrate()")
    class Orchestrate {

        @Test
        @DisplayName("returns the workflow result unchanged when it has no result files")
        void orchestrateNoFilesSkipsJobRegistration() throws IOException {
            AiWorkflowRequest request = new AiWorkflowRequest();
            AiWorkflowResponse result = new AiWorkflowResponse();
            result.setOutcome(AiWorkflowOutcome.ANSWER);
            result.setResultFiles(new ArrayList<>());
            when(aiWorkflowService.orchestrate(request)).thenReturn(result);

            AiWorkflowResponse returned = controller.orchestrate(request);

            assertSame(result, returned);
            verify(aiWorkflowService).orchestrate(request);
            verifyNoInteractions(taskManager, jobOwnershipService);
        }

        @Test
        @DisplayName("registers result files with the task manager under a scoped job key")
        void orchestrateRegistersResultFilesAsJob() throws IOException {
            AiWorkflowRequest request = new AiWorkflowRequest();
            AiWorkflowResponse result = new AiWorkflowResponse();
            result.setOutcome(AiWorkflowOutcome.COMPLETED);
            result.setResultFiles(
                    List.of(
                            new AiWorkflowResultFile("fid-1", "out.pdf", "application/pdf"),
                            new AiWorkflowResultFile("fid-2", "out.txt", "text/plain")));
            when(aiWorkflowService.orchestrate(request)).thenReturn(result);
            when(jobOwnershipService.createScopedJobKey(anyString())).thenReturn("alice:job-123");

            AiWorkflowResponse returned = controller.orchestrate(request);

            assertSame(result, returned);
            verify(jobOwnershipService).createScopedJobKey(anyString());
            verify(taskManager).createTask("alice:job-123");
            verify(taskManager).setComplete("alice:job-123");

            ArgumentCaptor<List<ResultFile>> filesCaptor = captorForResultFiles();
            verify(taskManager).setMultipleFileResults(eq("alice:job-123"), filesCaptor.capture());
            List<ResultFile> jobFiles = filesCaptor.getValue();
            assertEquals(2, jobFiles.size());
            assertEquals("fid-1", jobFiles.get(0).getFileId());
            assertEquals("out.pdf", jobFiles.get(0).getFileName());
            assertEquals("application/pdf", jobFiles.get(0).getContentType());
            assertEquals("fid-2", jobFiles.get(1).getFileId());
            assertEquals("text/plain", jobFiles.get(1).getContentType());
        }

        @Test
        @DisplayName("treats a null resultFiles list as no files and skips registration")
        void orchestrateNullResultFilesSkipsRegistration() throws IOException {
            AiWorkflowRequest request = new AiWorkflowRequest();
            AiWorkflowResponse result = new AiWorkflowResponse();
            result.setResultFiles(null);
            when(aiWorkflowService.orchestrate(request)).thenReturn(result);

            controller.orchestrate(request);

            verifyNoInteractions(taskManager, jobOwnershipService);
        }

        @Test
        @DisplayName("propagates IOException from the workflow service")
        void orchestratePropagatesIoException() throws IOException {
            AiWorkflowRequest request = new AiWorkflowRequest();
            when(aiWorkflowService.orchestrate(request)).thenThrow(new IOException("boom"));

            assertThrows(IOException.class, () -> controller.orchestrate(request));
            verifyNoInteractions(taskManager);
        }
    }

    @Nested
    @DisplayName("orchestrateStream()")
    class OrchestrateStream {

        @Test
        @DisplayName("runs the workflow on the executor and registers result files")
        void streamRunsWorkflowAndRegistersFiles() throws IOException {
            AiWorkflowRequest request = new AiWorkflowRequest();
            AiWorkflowResponse result = new AiWorkflowResponse();
            result.setOutcome(AiWorkflowOutcome.COMPLETED);
            result.setResultFiles(
                    List.of(new AiWorkflowResultFile("fid-9", "out.pdf", "application/pdf")));
            when(aiWorkflowService.orchestrate(
                            eq(request), any(AiWorkflowService.ProgressListener.class)))
                    .thenReturn(result);
            when(jobOwnershipService.createScopedJobKey(anyString())).thenReturn("scoped-key");

            // Inline executor means the workflow has fully run by the time this returns.
            var emitter = controller.orchestrateStream(request);

            assertNotNull(emitter);
            verify(aiWorkflowService)
                    .orchestrate(eq(request), any(AiWorkflowService.ProgressListener.class));
            verify(taskManager).createTask("scoped-key");
            verify(taskManager).setMultipleFileResults(eq("scoped-key"), any());
            verify(taskManager).setComplete("scoped-key");
        }

        @Test
        @DisplayName("does not register a job when the streamed workflow returns no files")
        void streamWithoutFilesDoesNotRegisterJob() throws IOException {
            AiWorkflowRequest request = new AiWorkflowRequest();
            AiWorkflowResponse result = new AiWorkflowResponse();
            result.setOutcome(AiWorkflowOutcome.ANSWER);
            result.setResultFiles(new ArrayList<>());
            when(aiWorkflowService.orchestrate(
                            eq(request), any(AiWorkflowService.ProgressListener.class)))
                    .thenReturn(result);

            controller.orchestrateStream(request);

            verify(aiWorkflowService)
                    .orchestrate(eq(request), any(AiWorkflowService.ProgressListener.class));
            verifyNoInteractions(taskManager, jobOwnershipService);
        }

        @Test
        @DisplayName(
                "swallows a workflow failure inside the stream task and still returns an emitter")
        void streamHandlesWorkflowExceptionGracefully() throws IOException {
            AiWorkflowRequest request = new AiWorkflowRequest();
            when(aiWorkflowService.orchestrate(
                            eq(request), any(AiWorkflowService.ProgressListener.class)))
                    .thenThrow(new IOException("engine exploded"));

            // The failure is caught inside runOrchestrationStream; it must not escape this call.
            var emitter = controller.orchestrateStream(request);

            assertNotNull(emitter);
            verify(aiWorkflowService)
                    .orchestrate(eq(request), any(AiWorkflowService.ProgressListener.class));
            // No files were produced, so no job registration is attempted.
            verifyNoInteractions(taskManager);
        }
    }

    @Nested
    @DisplayName("pdfEdit()")
    class PdfEdit {

        @Test
        @DisplayName("forwards the body with server-owned enabled_endpoints injected")
        void pdfEditInjectsEnabledEndpoints() throws IOException {
            when(userService.getCurrentUsername()).thenReturn("bob");
            when(endpointResolver.getEnabledEndpointUrls())
                    .thenReturn(List.of("/api/v1/misc/compress-pdf", "/api/v1/general/rotate"));
            when(aiEngineClient.post(eq("/api/v1/pdf/edit"), anyString(), eq("bob")))
                    .thenReturn("{\"plan\":[]}");

            ResponseEntity<String> response = controller.pdfEdit("{\"message\":\"rotate it\"}");

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals("{\"plan\":[]}", response.getBody());
            assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());

            ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
            verify(aiEngineClient).post(eq("/api/v1/pdf/edit"), bodyCaptor.capture(), eq("bob"));
            String forwarded = bodyCaptor.getValue();
            assertTrue(forwarded.contains("enabled_endpoints"), forwarded);
            assertTrue(forwarded.contains("/api/v1/misc/compress-pdf"), forwarded);
            assertTrue(forwarded.contains("/api/v1/general/rotate"), forwarded);
            // Original field is preserved alongside the injected list.
            assertTrue(forwarded.contains("rotate it"), forwarded);
        }

        @Test
        @DisplayName("overwrites a client-supplied enabled_endpoints with the server view")
        void pdfEditOverwritesClientSuppliedEndpoints() throws IOException {
            when(userService.getCurrentUsername()).thenReturn("bob");
            when(endpointResolver.getEnabledEndpointUrls())
                    .thenReturn(List.of("/api/v1/general/rotate"));
            when(aiEngineClient.post(eq("/api/v1/pdf/edit"), anyString(), anyString()))
                    .thenReturn("ok");

            controller.pdfEdit("{\"enabled_endpoints\":[\"/api/v1/evil/hack\"]}");

            ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
            verify(aiEngineClient).post(eq("/api/v1/pdf/edit"), bodyCaptor.capture(), anyString());
            String forwarded = bodyCaptor.getValue();
            assertTrue(forwarded.contains("/api/v1/general/rotate"), forwarded);
            assertTrue(!forwarded.contains("/api/v1/evil/hack"), forwarded);
        }

        @Test
        @DisplayName("emits an empty endpoint array when nothing is enabled")
        void pdfEditWithNoEnabledEndpoints() throws IOException {
            when(userService.getCurrentUsername()).thenReturn(null);
            when(endpointResolver.getEnabledEndpointUrls()).thenReturn(List.of());
            when(aiEngineClient.post(eq("/api/v1/pdf/edit"), anyString(), eq(null)))
                    .thenReturn("ok");

            controller.pdfEdit("{\"message\":\"hi\"}");

            ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
            verify(aiEngineClient).post(eq("/api/v1/pdf/edit"), bodyCaptor.capture(), eq(null));
            assertTrue(bodyCaptor.getValue().contains("\"enabled_endpoints\":[]"));
        }

        @Test
        @DisplayName("rejects a JSON array body with 400 (must be a JSON object)")
        void pdfEditRejectsNonObjectJson() {
            ResponseStatusException ex =
                    assertThrows(
                            ResponseStatusException.class, () -> controller.pdfEdit("[1,2,3]"));

            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
            assertTrue(ex.getReason() != null && ex.getReason().contains("JSON object"));
            verifyNoInteractions(aiEngineClient);
        }

        @Test
        @DisplayName("rejects a JSON scalar (number) body with 400")
        void pdfEditRejectsScalarJson() {
            ResponseStatusException ex =
                    assertThrows(ResponseStatusException.class, () -> controller.pdfEdit("42"));

            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
            verifyNoInteractions(aiEngineClient);
        }

        @Test
        @DisplayName("rejects malformed JSON with a 400 'not valid JSON' error")
        void pdfEditRejectsInvalidJson() {
            ResponseStatusException ex =
                    assertThrows(
                            ResponseStatusException.class,
                            () -> controller.pdfEdit("{not valid json"));

            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
            assertTrue(ex.getReason() != null && ex.getReason().contains("valid JSON"));
            verifyNoInteractions(aiEngineClient);
        }

        @Test
        @DisplayName("propagates IOException from the engine client")
        void pdfEditPropagatesIoException() throws IOException {
            when(userService.getCurrentUsername()).thenReturn("bob");
            when(endpointResolver.getEnabledEndpointUrls()).thenReturn(List.of());
            when(aiEngineClient.post(eq("/api/v1/pdf/edit"), anyString(), anyString()))
                    .thenThrow(new IOException("unreachable"));

            assertThrows(IOException.class, () -> controller.pdfEdit("{\"message\":\"x\"}"));
        }
    }

    @Nested
    @DisplayName("currentUserId() propagation")
    class CurrentUser {

        @Test
        @DisplayName("null UserServiceInterface yields a null user id everywhere")
        void nullUserServiceMeansNullUserId() throws IOException {
            AiEngineController noSecurity = newController(null);
            when(endpointResolver.getEnabledEndpointUrls()).thenReturn(List.of());
            when(aiEngineClient.post(eq("/api/v1/pdf/edit"), anyString(), eq(null)))
                    .thenReturn("ok");

            noSecurity.pdfEdit("{\"message\":\"x\"}");

            verify(aiEngineClient).post(eq("/api/v1/pdf/edit"), anyString(), eq(null));
            verifyNoInteractions(userService);
        }

        @Test
        @DisplayName("a logged-in user id is forwarded to the engine client")
        void loggedInUserIdForwarded() throws IOException {
            when(userService.getCurrentUsername()).thenReturn("carol");
            when(aiEngineClient.get("/health", "carol")).thenReturn("{}");

            controller.health();

            verify(aiEngineClient).get("/health", "carol");
        }
    }

    @SuppressWarnings("unchecked")
    private static ArgumentCaptor<List<ResultFile>> captorForResultFiles() {
        return ArgumentCaptor.forClass(List.class);
    }
}
