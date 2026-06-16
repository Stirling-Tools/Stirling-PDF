package stirling.software.proprietary.policy.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

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
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.JobResponse;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.FolderAccessGuard;
import stirling.software.proprietary.policy.engine.PolicyRunHandle;
import stirling.software.proprietary.policy.engine.PolicyRunRegistry;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.store.PolicyStore;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Unit tests for {@link PolicyController}: the premium policy admin entry point. Each handler is
 * called directly with mocked collaborators; JSON parsing uses a real Jackson mapper so the parse
 * branches are exercised end to end. No Spring context is booted.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PolicyControllerTest {

    @Mock private PolicyRunner policyRunner;
    @Mock private PolicyRunRegistry runRegistry;
    @Mock private PolicyStore policyStore;
    @Mock private PolicyValidator policyValidator;
    @Mock private FolderAccessGuard folderAccessGuard;
    @Mock private UserServiceInterface userService;
    @Mock private stirling.software.common.util.TempFileManager tempFileManager;

    private final ObjectMapper objectMapper = JsonMapper.builder().build();
    private ApplicationProperties applicationProperties;
    private PolicyController controller;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        controller =
                new PolicyController(
                        policyRunner,
                        runRegistry,
                        policyStore,
                        policyValidator,
                        folderAccessGuard,
                        userService,
                        applicationProperties,
                        objectMapper,
                        tempFileManager);
    }

    /** Multipart request whose file map is empty, so collectInputs returns empty inputs. */
    private static MultipartHttpServletRequest emptyMultipart() {
        MultipartHttpServletRequest request =
                org.mockito.Mockito.mock(MultipartHttpServletRequest.class);
        MultiValueMap<String, MultipartFile> map = new LinkedMultiValueMap<>();
        when(request.getMultiFileMap()).thenReturn(map);
        return request;
    }

    private static String validDefinitionJson() {
        return "{\"name\":\"d\",\"steps\":[{\"operation\":\"/api/v1/misc/compress-pdf\","
                + "\"parameters\":{}}],\"output\":{\"type\":\"inline\",\"options\":{}}}";
    }

    private static Policy samplePolicy() {
        return new Policy(
                "p1",
                "name",
                "owner",
                true,
                null,
                List.of(),
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.inline());
    }

    // ------------------------------------------------------------------
    // POST /run (ad-hoc pipeline)
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("run (ad-hoc pipeline)")
    class Run {

        @Test
        @DisplayName("accepts a valid definition and returns 202 with the run id")
        void runAcceptedReturnsRunId() throws IOException {
            PolicyRunHandle handle = new PolicyRunHandle("run-123", new CompletableFuture<>());
            when(policyRunner.runAdHoc(any(), any(), eq(PolicyProgressListener.NOOP)))
                    .thenReturn(handle);

            ResponseEntity<JobResponse<Void>> response =
                    controller.run(validDefinitionJson(), emptyMultipart());

            assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
            JobResponse<Void> body = response.getBody();
            assertNotNull(body);
            assertTrue(body.isAsync());
            assertEquals("run-123", body.getJobId());
            assertNull(body.getResult());
        }

        @Test
        @DisplayName("passes the parsed definition through to the runner")
        void runPassesParsedDefinition() throws IOException {
            when(policyRunner.runAdHoc(any(), any(), any()))
                    .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

            controller.run(validDefinitionJson(), emptyMultipart());

            ArgumentCaptor<PipelineDefinition> captor =
                    ArgumentCaptor.forClass(PipelineDefinition.class);
            verify(policyRunner).runAdHoc(captor.capture(), any(), eq(PolicyProgressListener.NOOP));
            assertEquals("d", captor.getValue().name());
            assertEquals(1, captor.getValue().steps().size());
        }

        @Test
        @DisplayName("rejects malformed definition JSON with 400")
        void runRejectsMalformedJson() {
            ResponseStatusException ex =
                    assertThrows(
                            ResponseStatusException.class,
                            () -> controller.run("{not json", emptyMultipart()));
            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
            verifyNoInteractions(policyRunner);
        }

        @Test
        @DisplayName("rejects a definition with no steps with 400")
        void runRejectsEmptySteps() {
            String json = "{\"name\":\"d\",\"steps\":[],\"output\":{\"type\":\"inline\"}}";
            ResponseStatusException ex =
                    assertThrows(
                            ResponseStatusException.class,
                            () -> controller.run(json, emptyMultipart()));
            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
            verifyNoInteractions(policyRunner);
        }
    }

    // ------------------------------------------------------------------
    // POST /run/stream
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("runStream")
    class RunStream {

        @Test
        @DisplayName("returns a non-null SseEmitter using the configured timeout")
        void runStreamReturnsEmitter() throws IOException {
            applicationProperties.getPolicies().setStreamTimeoutMs(12345L);
            PolicyRun run = new PolicyRun("r", new PipelineDefinition("d", List.of(), null));
            run.complete(List.of());
            PolicyRunHandle handle =
                    new PolicyRunHandle("r", CompletableFuture.completedFuture(run));
            when(policyRunner.runAdHoc(any(), any(), any())).thenReturn(handle);

            SseEmitter emitter = controller.runStream(validDefinitionJson(), emptyMultipart());

            assertNotNull(emitter);
            assertEquals(Long.valueOf(12345L), emitter.getTimeout());
            verify(policyRunner).runAdHoc(any(), any(), any());
        }

        @Test
        @DisplayName("rejects malformed JSON before touching the runner")
        void runStreamRejectsMalformedJson() {
            assertThrows(
                    ResponseStatusException.class,
                    () -> controller.runStream("{bad", emptyMultipart()));
            verifyNoInteractions(policyRunner);
        }

        @Test
        @DisplayName("completes normally when the run completion future resolves successfully")
        void runStreamHandlesSuccessfulCompletion() throws IOException {
            PolicyRun run = new PolicyRun("r", new PipelineDefinition("d", List.of(), null));
            run.complete(List.of());
            when(policyRunner.runAdHoc(any(), any(), any()))
                    .thenReturn(new PolicyRunHandle("r", CompletableFuture.completedFuture(run)));

            // Should not throw even though the completion callback runs inline.
            assertNotNull(controller.runStream(validDefinitionJson(), emptyMultipart()));
        }

        @Test
        @DisplayName("completes normally when the run completion future fails")
        void runStreamHandlesFailedCompletion() throws IOException {
            CompletableFuture<PolicyRun> failed = new CompletableFuture<>();
            failed.completeExceptionally(new RuntimeException("boom"));
            when(policyRunner.runAdHoc(any(), any(), any()))
                    .thenReturn(new PolicyRunHandle("r", failed));

            assertNotNull(controller.runStream(validDefinitionJson(), emptyMultipart()));
        }
    }

    // ------------------------------------------------------------------
    // GET /run/{runId}
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("status")
    class Status {

        @Test
        @DisplayName("returns 200 with the run view when the run exists")
        void statusReturnsView() {
            PolicyRun run = new PolicyRun("r9", new PipelineDefinition("d", List.of(), null));
            when(runRegistry.get("r9")).thenReturn(run);

            ResponseEntity<stirling.software.proprietary.policy.model.PolicyRunView> response =
                    controller.status("r9");

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertEquals("r9", response.getBody().runId());
        }

        @Test
        @DisplayName("returns 404 when the run is unknown")
        void statusReturnsNotFound() {
            when(runRegistry.get("missing")).thenReturn(null);

            ResponseEntity<stirling.software.proprietary.policy.model.PolicyRunView> response =
                    controller.status("missing");

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertNull(response.getBody());
        }
    }

    // ------------------------------------------------------------------
    // POST / (save policy) + folder-access authorization
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("savePolicy")
    class SavePolicy {

        private String policyJson() {
            return "{\"id\":\"\",\"name\":\"My Policy\",\"owner\":\"o\",\"enabled\":true,"
                    + "\"steps\":[{\"operation\":\"/api/v1/misc/compress-pdf\",\"parameters\":{}}],"
                    + "\"output\":{\"type\":\"inline\",\"options\":{}}}";
        }

        @Test
        @DisplayName(
                "validates and stores a non-folder policy, returning 200 with the saved policy")
        void savesValidPolicy() {
            Policy saved = samplePolicy();
            when(folderAccessGuard.usesFolderAccess(any())).thenReturn(false);
            when(policyStore.save(any())).thenReturn(saved);

            ResponseEntity<Policy> response = controller.savePolicy(policyJson());

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertSame(saved, response.getBody());
            verify(policyValidator).validate(any());
            // Non-folder policy never consults the admin check.
            verifyNoInteractions(userService);
        }

        @Test
        @DisplayName("rejects malformed policy JSON with 400 before any side effects")
        void rejectsMalformedJson() {
            ResponseStatusException ex =
                    assertThrows(
                            ResponseStatusException.class,
                            () -> controller.savePolicy("{not valid"));
            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
            assertEquals("Invalid policy JSON", ex.getReason());
            verifyNoInteractions(policyStore);
            verifyNoInteractions(policyValidator);
        }

        @Test
        @DisplayName("maps a validation IllegalArgumentException to 400 with its message")
        void mapsValidationFailureToBadRequest() {
            when(folderAccessGuard.usesFolderAccess(any())).thenReturn(false);
            org.mockito.Mockito.doThrow(new IllegalArgumentException("bad schedule"))
                    .when(policyValidator)
                    .validate(any());

            ResponseStatusException ex =
                    assertThrows(
                            ResponseStatusException.class,
                            () -> controller.savePolicy(policyJson()));

            assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
            assertEquals("bad schedule", ex.getReason());
            verify(policyStore, never()).save(any());
        }

        @Test
        @DisplayName("folder policy + login enabled + non-admin is forbidden (403)")
        void folderPolicyNonAdminForbidden() {
            applicationProperties.getSecurity().setEnableLogin(true);
            when(folderAccessGuard.usesFolderAccess(any())).thenReturn(true);
            when(userService.isCurrentUserAdmin()).thenReturn(false);

            ResponseStatusException ex =
                    assertThrows(
                            ResponseStatusException.class,
                            () -> controller.savePolicy(policyJson()));

            assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
            // Denied before validation/storage.
            verify(policyValidator, never()).validate(any());
            verify(policyStore, never()).save(any());
        }

        @Test
        @DisplayName("folder policy + login enabled + admin is allowed")
        void folderPolicyAdminAllowed() {
            applicationProperties.getSecurity().setEnableLogin(true);
            Policy saved = samplePolicy();
            when(folderAccessGuard.usesFolderAccess(any())).thenReturn(true);
            when(userService.isCurrentUserAdmin()).thenReturn(true);
            when(policyStore.save(any())).thenReturn(saved);

            ResponseEntity<Policy> response = controller.savePolicy(policyJson());

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertSame(saved, response.getBody());
        }

        @Test
        @DisplayName("folder policy with login disabled skips the admin check (single-user trust)")
        void folderPolicyLoginDisabledSkipsAdminCheck() {
            applicationProperties.getSecurity().setEnableLogin(false);
            Policy saved = samplePolicy();
            when(folderAccessGuard.usesFolderAccess(any())).thenReturn(true);
            when(policyStore.save(any())).thenReturn(saved);

            ResponseEntity<Policy> response = controller.savePolicy(policyJson());

            assertEquals(HttpStatus.OK, response.getStatusCode());
            // The admin check is never consulted when login is off.
            verify(userService, never()).isCurrentUserAdmin();
        }
    }

    // ------------------------------------------------------------------
    // GET / , GET /{id} , DELETE /{id}
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("policy CRUD reads")
    class PolicyReads {

        @Test
        @DisplayName("listPolicies returns the store's full list")
        void listReturnsAll() {
            List<Policy> all = List.of(samplePolicy());
            when(policyStore.all()).thenReturn(all);

            assertSame(all, controller.listPolicies());
        }

        @Test
        @DisplayName("getPolicy returns 200 with the policy when present")
        void getReturnsPolicy() {
            Policy policy = samplePolicy();
            when(policyStore.get("p1")).thenReturn(Optional.of(policy));

            ResponseEntity<Policy> response = controller.getPolicy("p1");

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertSame(policy, response.getBody());
        }

        @Test
        @DisplayName("getPolicy returns 404 when absent")
        void getReturnsNotFound() {
            when(policyStore.get("nope")).thenReturn(Optional.empty());

            ResponseEntity<Policy> response = controller.getPolicy("nope");

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
            assertNull(response.getBody());
        }

        @Test
        @DisplayName("deletePolicy returns 204 when the policy existed")
        void deleteReturnsNoContent() {
            when(policyStore.delete("p1")).thenReturn(true);

            ResponseEntity<Void> response = controller.deletePolicy("p1");

            assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        }

        @Test
        @DisplayName("deletePolicy returns 404 when the policy did not exist")
        void deleteReturnsNotFound() {
            when(policyStore.delete("ghost")).thenReturn(false);

            ResponseEntity<Void> response = controller.deletePolicy("ghost");

            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        }
    }

    // ------------------------------------------------------------------
    // POST /{id}/run (run stored policy)
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("runStoredPolicy")
    class RunStoredPolicy {

        @Test
        @DisplayName("runs the stored policy and returns 202 with the run id")
        void runsStoredPolicy() throws IOException {
            Policy policy = samplePolicy();
            when(policyStore.get("p1")).thenReturn(Optional.of(policy));
            when(policyRunner.runWith(eq(policy), any(), eq(PolicyProgressListener.NOOP)))
                    .thenReturn(new PolicyRunHandle("run-77", new CompletableFuture<>()));

            ResponseEntity<JobResponse<Void>> response =
                    controller.runStoredPolicy("p1", emptyMultipart());

            assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().isAsync());
            assertEquals("run-77", response.getBody().getJobId());
        }

        @Test
        @DisplayName("returns 404 (ResponseStatusException) when the policy id is unknown")
        void unknownPolicyNotFound() {
            when(policyStore.get("missing")).thenReturn(Optional.empty());

            ResponseStatusException ex =
                    assertThrows(
                            ResponseStatusException.class,
                            () -> controller.runStoredPolicy("missing", emptyMultipart()));

            assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
            verifyNoInteractions(policyRunner);
        }
    }

    // ------------------------------------------------------------------
    // collectInputs (exercised via run): primary vs supporting-file split
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("collectInputs file splitting")
    class CollectInputs {

        @Test
        @DisplayName("splits 'fileInput' into primary and other fields into supporting assets")
        void splitsPrimaryAndSupporting() throws IOException {
            MultipartHttpServletRequest request =
                    org.mockito.Mockito.mock(MultipartHttpServletRequest.class);
            MultiValueMap<String, MultipartFile> map = new LinkedMultiValueMap<>();

            MultipartFile primary = nonEmptyFile("doc.pdf");
            MultipartFile logo = nonEmptyFile("logo.png");
            map.add("fileInput", primary);
            map.add("company-logo", logo);
            when(request.getMultiFileMap()).thenReturn(map);

            stirling.software.common.util.TempFile temp =
                    org.mockito.Mockito.mock(stirling.software.common.util.TempFile.class);
            when(temp.getPath()).thenReturn(java.nio.file.Path.of("temp-path"));
            when(temp.getFile()).thenReturn(new java.io.File("temp-file"));
            when(tempFileManager.createManagedTempFile(any())).thenReturn(temp);
            when(policyRunner.runAdHoc(any(), any(), any()))
                    .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

            controller.run(validDefinitionJson(), request);

            ArgumentCaptor<PolicyInputs> captor = ArgumentCaptor.forClass(PolicyInputs.class);
            verify(policyRunner).runAdHoc(any(), captor.capture(), any());
            PolicyInputs inputs = captor.getValue();
            assertEquals(1, inputs.primary().size());
            assertTrue(inputs.supportingFiles().containsKey("company-logo"));
            assertEquals(1, inputs.supportingFiles().get("company-logo").size());
            assertFalse(inputs.supportingFiles().containsKey("fileInput"));
        }

        @Test
        @DisplayName("skips empty/null files so no temp file is created for them")
        void skipsEmptyFiles() throws IOException {
            MultipartHttpServletRequest request =
                    org.mockito.Mockito.mock(MultipartHttpServletRequest.class);
            MultiValueMap<String, MultipartFile> map = new LinkedMultiValueMap<>();

            MultipartFile empty = org.mockito.Mockito.mock(MultipartFile.class);
            when(empty.isEmpty()).thenReturn(true);
            map.add("fileInput", empty);
            when(request.getMultiFileMap()).thenReturn(map);
            when(policyRunner.runAdHoc(any(), any(), any()))
                    .thenReturn(new PolicyRunHandle("r", new CompletableFuture<>()));

            controller.run(validDefinitionJson(), request);

            // An empty file never reaches the temp-file manager and produces no primary resource.
            verify(tempFileManager, never()).createManagedTempFile(any());
            ArgumentCaptor<PolicyInputs> captor = ArgumentCaptor.forClass(PolicyInputs.class);
            verify(policyRunner).runAdHoc(any(), captor.capture(), any());
            assertTrue(captor.getValue().primary().isEmpty());
            assertTrue(captor.getValue().supportingFiles().isEmpty());
        }

        private MultipartFile nonEmptyFile(String name) throws IOException {
            MultipartFile file = org.mockito.Mockito.mock(MultipartFile.class);
            when(file.isEmpty()).thenReturn(false);
            when(file.getOriginalFilename()).thenReturn(name);
            return file;
        }
    }
}
