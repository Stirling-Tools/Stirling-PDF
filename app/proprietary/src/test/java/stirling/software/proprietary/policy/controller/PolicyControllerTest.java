package stirling.software.proprietary.policy.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.JobResponse;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyRunHandle;
import stirling.software.proprietary.policy.engine.PolicyRunRegistry;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunView;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.source.SourceAccessGuard;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;

@ExtendWith(MockitoExtension.class)
@DisplayName("PolicyController")
class PolicyControllerTest {

    @Mock private PolicyRunner policyRunner;
    @Mock private PolicyRunRegistry runRegistry;
    @Mock private stirling.software.proprietary.policy.store.PolicyStore policyStore;
    @Mock private SourceStore sourceStore;
    @Mock private SourceAccessGuard sourceAccessGuard;
    @Mock private PolicyValidator policyValidator;
    @Mock private PolicyAccessGuard policyAccessGuard;
    @Mock private PolicyManagementAuthority policyManagementAuthority;
    @Mock private PolicyTriggerManager policyTriggerManager;
    @Mock private TempFileManager tempFileManager;
    @Mock private JobOwnershipService jobOwnershipService;

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
                        sourceStore,
                        sourceAccessGuard,
                        policyValidator,
                        policyAccessGuard,
                        policyManagementAuthority,
                        policyTriggerManager,
                        applicationProperties,
                        tempFileManager,
                        jobOwnershipService);
    }

    private static PipelineDefinition definitionWithStep() {
        return new PipelineDefinition(
                "pipe", List.of(new PipelineStep("/api/v1/misc/compress-pdf", null)), null);
    }

    private static Policy policy(String id, Long teamId) {
        return new Policy(id, "name", "owner", true, null, List.of(), List.of(), null, teamId);
    }

    private static PolicyRunHandle handle(String runId) {
        PolicyRun run = new PolicyRun(runId, null, definitionWithStep());
        return new PolicyRunHandle(runId, CompletableFuture.completedFuture(run));
    }

    @Nested
    @DisplayName("run (ad-hoc)")
    class Run {

        @Test
        @DisplayName("accepts a runnable pipeline and returns a run id")
        void runsAdHoc() throws Exception {
            when(policyRunner.runAdHoc(any(), any(), eq(PolicyProgressListener.NOOP)))
                    .thenReturn(handle("run-1"));

            ResponseEntity<JobResponse<Void>> response =
                    controller.run(definitionWithStep(), new PolicyRunFiles());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
            assertThat(response.getBody().getJobId()).isEqualTo("run-1");
        }

        @Test
        @DisplayName("rejects a pipeline with no steps")
        void rejectsEmptyPipeline() {
            PipelineDefinition empty = new PipelineDefinition("pipe", List.of(), null);

            assertThatThrownBy(() -> controller.run(empty, new PolicyRunFiles()))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            e ->
                                    assertThat(((ResponseStatusException) e).getStatusCode())
                                            .isEqualTo(HttpStatus.BAD_REQUEST));
        }
    }

    @Nested
    @DisplayName("runStream (SSE)")
    class RunStream {

        @Test
        @DisplayName("returns an emitter for a runnable pipeline")
        void returnsEmitter() throws Exception {
            when(policyRunner.runAdHoc(any(), any(), any())).thenReturn(handle("run-2"));

            SseEmitter emitter = controller.runStream(definitionWithStep(), new PolicyRunFiles());

            assertThat(emitter).isNotNull();
        }

        @Test
        @DisplayName("rejects a pipeline with no steps")
        void rejectsEmpty() {
            PipelineDefinition empty = new PipelineDefinition("pipe", List.of(), null);

            assertThatThrownBy(() -> controller.runStream(empty, new PolicyRunFiles()))
                    .isInstanceOf(ResponseStatusException.class);
        }
    }

    @Nested
    @DisplayName("status")
    class Status {

        @Test
        @DisplayName("returns the run view when present")
        void found() {
            PolicyRun run = new PolicyRun("run-3", null, definitionWithStep());
            when(runRegistry.get("run-3")).thenReturn(run);

            ResponseEntity<PolicyRunView> response = controller.status("run-3");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody().runId()).isEqualTo("run-3");
        }

        @Test
        @DisplayName("returns 404 when run is unknown")
        void notFound() {
            when(runRegistry.get("missing")).thenReturn(null);

            ResponseEntity<PolicyRunView> response = controller.status("missing");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    @Nested
    @DisplayName("listRuns")
    class ListRuns {

        @Test
        @DisplayName("excludes ad-hoc runs and runs owned by others")
        void filtersRuns() {
            PolicyRun adHoc = new PolicyRun("adhoc", null, definitionWithStep());
            PolicyRun ownedStored = new PolicyRun("owned", "policy-A", definitionWithStep());
            PolicyRun otherStored = new PolicyRun("other", "policy-B", definitionWithStep());
            when(runRegistry.all()).thenReturn(List.of(adHoc, ownedStored, otherStored));

            // ownedByCurrentUser: strip then re-apply scope reproduces the key only for the owned
            // run
            when(jobOwnershipService.extractJobId(any())).thenAnswer(i -> i.getArgument(0));
            when(jobOwnershipService.createScopedJobKey("owned")).thenReturn("owned");
            when(jobOwnershipService.createScopedJobKey("other")).thenReturn("scoped-other");

            List<PolicyRunView> views = controller.listRuns();

            assertThat(views).hasSize(1);
            assertThat(views.get(0).runId()).isEqualTo("owned");
        }
    }

    @Nested
    @DisplayName("savePolicy")
    class SavePolicy {

        @Test
        @DisplayName("saves a new policy when editing is allowed")
        void savesNew() {
            applicationProperties.getSecurity().setEnableLogin(true);
            when(policyManagementAuthority.canEditPolicies()).thenReturn(true);
            when(policyAccessGuard.ownerForNewPolicy()).thenReturn("alice");
            when(policyAccessGuard.teamForNewPolicy()).thenReturn(7L);
            Policy incoming = policy(null, null);
            when(policyStore.save(any())).thenAnswer(i -> i.getArgument(0));

            ResponseEntity<Policy> response = controller.savePolicy(incoming);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody().owner()).isEqualTo("alice");
            assertThat(response.getBody().teamId()).isEqualTo(7L);
            verify(policyValidator).validate(any());
            verify(policyTriggerManager).notifyPoliciesChanged();
        }

        @Test
        @DisplayName("forbidden when login enabled and caller cannot edit")
        void forbidden() {
            applicationProperties.getSecurity().setEnableLogin(true);
            when(policyManagementAuthority.canEditPolicies()).thenReturn(false);

            assertThatThrownBy(() -> controller.savePolicy(policy(null, null)))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            e ->
                                    assertThat(((ResponseStatusException) e).getStatusCode())
                                            .isEqualTo(HttpStatus.FORBIDDEN));
            verify(policyStore, never()).save(any());
            verify(policyTriggerManager, never()).notifyPoliciesChanged();
        }

        @Test
        @DisplayName("bad request when validation fails")
        void validationFails() {
            applicationProperties.getSecurity().setEnableLogin(false);
            when(policyAccessGuard.ownerForNewPolicy()).thenReturn(null);
            when(policyAccessGuard.teamForNewPolicy()).thenReturn(null);
            org.mockito.Mockito.doThrow(new IllegalArgumentException("bad output"))
                    .when(policyValidator)
                    .validate(any());

            assertThatThrownBy(() -> controller.savePolicy(policy(null, null)))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            e ->
                                    assertThat(((ResponseStatusException) e).getStatusCode())
                                            .isEqualTo(HttpStatus.BAD_REQUEST));
        }

        @Test
        @DisplayName("not found when updating a policy in another team")
        void crossTeamNotFound() {
            applicationProperties.getSecurity().setEnableLogin(false);
            Policy existing = policy("p1", 99L);
            when(policyStore.get("p1")).thenReturn(Optional.of(existing));
            when(policyAccessGuard.canAccess(existing)).thenReturn(false);

            assertThatThrownBy(() -> controller.savePolicy(policy("p1", null)))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            e ->
                                    assertThat(((ResponseStatusException) e).getStatusCode())
                                            .isEqualTo(HttpStatus.NOT_FOUND));
        }

        @Test
        @DisplayName("update preserves the existing owner and team")
        void updatePreservesOwnership() {
            applicationProperties.getSecurity().setEnableLogin(false);
            Policy existing =
                    new Policy(
                            "p2", "name", "origOwner", true, null, List.of(), List.of(), null, 3L);
            when(policyStore.get("p2")).thenReturn(Optional.of(existing));
            when(policyAccessGuard.canAccess(existing)).thenReturn(true);
            when(policyStore.save(any())).thenAnswer(i -> i.getArgument(0));

            ResponseEntity<Policy> response =
                    controller.savePolicy(
                            new Policy(
                                    "p2", "name", "forged", true, null, List.of(), List.of(), null,
                                    77L));

            assertThat(response.getBody().owner()).isEqualTo("origOwner");
            assertThat(response.getBody().teamId()).isEqualTo(3L);
        }
    }

    @Nested
    @DisplayName("listPolicies / getPolicy")
    class ListAndGet {

        @Test
        @DisplayName("listPolicies returns team-visible policies")
        void listVisible() {
            List<Policy> all = List.of(policy("a", 1L), policy("b", 1L));
            when(policyAccessGuard.visibleFrom(policyStore)).thenReturn(all);

            List<Policy> result = controller.listPolicies();

            assertThat(result).hasSize(2);
        }

        @Test
        @DisplayName("getPolicy returns the policy when accessible")
        void getAccessible() {
            Policy p = policy("a", 1L);
            when(policyStore.get("a")).thenReturn(Optional.of(p));
            when(policyAccessGuard.canAccess(p)).thenReturn(true);

            ResponseEntity<Policy> response = controller.getPolicy("a");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody().id()).isEqualTo("a");
        }

        @Test
        @DisplayName("getPolicy returns 404 when not accessible")
        void getNotAccessible() {
            Policy p = policy("a", 1L);
            when(policyStore.get("a")).thenReturn(Optional.of(p));
            when(policyAccessGuard.canAccess(p)).thenReturn(false);

            ResponseEntity<Policy> response = controller.getPolicy("a");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        @DisplayName("getPolicy returns 404 when missing")
        void getMissing() {
            when(policyStore.get("z")).thenReturn(Optional.empty());

            ResponseEntity<Policy> response = controller.getPolicy("z");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        }
    }

    @Nested
    @DisplayName("deletePolicy")
    class DeletePolicy {

        @Test
        @DisplayName("deletes an accessible policy")
        void deletes() {
            applicationProperties.getSecurity().setEnableLogin(false);
            Policy p = policy("a", 1L);
            when(policyStore.get("a")).thenReturn(Optional.of(p));
            when(policyAccessGuard.canAccess(p)).thenReturn(true);
            when(policyStore.delete("a")).thenReturn(true);

            ResponseEntity<Void> response = controller.deletePolicy("a");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
            verify(policyTriggerManager).notifyPoliciesChanged();
        }

        @Test
        @DisplayName("returns 404 when policy is not accessible")
        void notAccessible() {
            applicationProperties.getSecurity().setEnableLogin(false);
            Policy p = policy("a", 1L);
            when(policyStore.get("a")).thenReturn(Optional.of(p));
            when(policyAccessGuard.canAccess(p)).thenReturn(false);

            ResponseEntity<Void> response = controller.deletePolicy("a");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            verify(policyStore, never()).delete(any());
            verify(policyTriggerManager, never()).notifyPoliciesChanged();
        }

        @Test
        @DisplayName("forbidden when login enabled and caller cannot edit")
        void forbidden() {
            applicationProperties.getSecurity().setEnableLogin(true);
            when(policyManagementAuthority.canEditPolicies()).thenReturn(false);

            assertThatThrownBy(() -> controller.deletePolicy("a"))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            e ->
                                    assertThat(((ResponseStatusException) e).getStatusCode())
                                            .isEqualTo(HttpStatus.FORBIDDEN));
        }
    }

    @Nested
    @DisplayName("runStoredPolicy")
    class RunStoredPolicy {

        @Test
        @DisplayName("runs a stored, accessible policy")
        void runsStored() throws Exception {
            Policy p = policy("a", 1L);
            when(policyStore.get("a")).thenReturn(Optional.of(p));
            when(policyAccessGuard.canAccess(p)).thenReturn(true);
            when(policyRunner.runWith(eq(p), any(), eq(PolicyProgressListener.NOOP)))
                    .thenReturn(handle("run-9"));

            ResponseEntity<JobResponse<Void>> response =
                    controller.runStoredPolicy("a", new PolicyRunFiles());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
            assertThat(response.getBody().getJobId()).isEqualTo("run-9");
        }

        @Test
        @DisplayName("not found when the stored policy is inaccessible")
        void notFound() {
            when(policyStore.get("a")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> controller.runStoredPolicy("a", new PolicyRunFiles()))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            e ->
                                    assertThat(((ResponseStatusException) e).getStatusCode())
                                            .isEqualTo(HttpStatus.NOT_FOUND));
        }
    }
}
