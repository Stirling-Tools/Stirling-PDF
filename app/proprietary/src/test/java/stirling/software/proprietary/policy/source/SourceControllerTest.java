package stirling.software.proprietary.policy.source;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.InProcessPolicyStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;

/**
 * Tests for {@link SourceController}'s delete guard: a source still referenced by a policy is
 * protected (409), while an unreferenced one is removed. Login is disabled, so editing and team
 * scoping pass through and the reference check is exercised on its own.
 */
class SourceControllerTest {

    private final SourceStore sourceStore = new InProcessSourceStore();
    private final PolicyStore policyStore = new InProcessPolicyStore();
    private PolicyTriggerManager triggerManager;
    private SourceController controller;

    @BeforeEach
    void setUp() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSecurity().setEnableLogin(false);
        UserServiceInterface userService = mock(UserServiceInterface.class);
        PolicyManagementAuthority authority = mock(PolicyManagementAuthority.class);
        SourceAccessGuard sourceGuard = new SourceAccessGuard(userService, properties, authority);
        PolicyAccessGuard policyGuard = new PolicyAccessGuard(userService, properties, authority);
        SourceOverviewService overviewService =
                new SourceOverviewService(
                        sourceStore,
                        policyStore,
                        sourceGuard,
                        policyGuard,
                        new InProcessSourceDocCounter());
        triggerManager = mock(PolicyTriggerManager.class);
        // A permissive input source so config validation passes and save can be exercised.
        InputSource folderInput = mock(InputSource.class);
        when(folderInput.supports(any())).thenReturn(true);
        controller =
                new SourceController(
                        sourceStore,
                        sourceGuard,
                        overviewService,
                        policyStore,
                        policyGuard,
                        authority,
                        triggerManager,
                        properties,
                        List.of(folderInput));
    }

    @Test
    void deletingAReferencedSourceConflicts() {
        Source source = sourceStore.save(folderSource());
        policyStore.save(policyReferencing("Redact incoming", source.id()));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> controller.delete(source.id()));

        assertEquals(409, ex.getStatusCode().value());
        assertTrue(sourceStore.get(source.id()).isPresent());
    }

    @Test
    void deletingAnUnreferencedSourceSucceeds() {
        Source source = sourceStore.save(folderSource());

        ResponseEntity<Void> response = controller.delete(source.id());

        assertEquals(204, response.getStatusCode().value());
        assertTrue(sourceStore.get(source.id()).isEmpty());
        // A deletable source is referenced by no policy, so no watch registration can change.
        verify(triggerManager, never()).notifyPoliciesChanged();
    }

    @Test
    void savingASourceReSyncsTriggerRegistrations() {
        controller.save(folderSource());

        verify(triggerManager).notifyPoliciesChanged();
    }

    @Test
    void deletingAMissingSourceIsNotFound() {
        assertEquals(404, controller.delete("nope").getStatusCode().value());
    }

    private static Source folderSource() {
        return new Source(
                null, "Claims intake", "folder", Map.of("directory", "/in"), true, "owner", null);
    }

    private static Policy policyReferencing(String name, String sourceId) {
        return new Policy(
                null,
                name,
                "owner",
                true,
                null,
                List.of(sourceId),
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.inline());
    }
}
