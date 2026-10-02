package stirling.software.proprietary.policy.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Installing a store manifest makes a paused, source-less, destination-less copy with a store link.
 */
@ExtendWith(MockitoExtension.class)
class PolicyImportControllerTest {

    @Mock private PolicyStore policyStore;
    @Mock private PolicyValidator policyValidator;
    @Mock private PolicyAccessGuard policyAccessGuard;
    @Mock private PolicyManagementAuthority policyManagementAuthority;

    private PolicyImportController controller() {
        return new PolicyImportController(
                policyStore, policyValidator, policyAccessGuard, policyManagementAuthority);
    }

    private static PolicyImportController.PolicyImportRequest request(String name) {
        return new PolicyImportController.PolicyImportRequest(
                name,
                "route",
                "sp-8k2m4q7x",
                List.of(
                        new PipelineStep(
                                "/api/v1/misc/compress-pdf",
                                Map.of("optimizeLevel", 6),
                                Map.of("someFile", "asset:should-be-dropped"))));
    }

    @Test
    void refusesWhenTheCallerMayNotEditPolicies() {
        when(policyManagementAuthority.canEditPolicies()).thenReturn(false);

        assertThatThrownBy(() -> controller().importPipeline(request("Board pack archive")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void createsAPausedCopyWithOnlyTheStoreLink() {
        when(policyManagementAuthority.canEditPolicies()).thenReturn(true);
        when(policyAccessGuard.teamForNewPolicy()).thenReturn(7L);
        when(policyAccessGuard.ownerForNewPolicy()).thenReturn("alice");
        when(policyStore.findByTeam(7L)).thenReturn(List.of());
        when(policyStore.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Policy saved = controller().importPipeline(request("Board pack archive")).getBody();

        ArgumentCaptor<Policy> captor = ArgumentCaptor.forClass(Policy.class);
        verify(policyStore).save(captor.capture());
        Policy stored = captor.getValue();
        assertThat(saved).isSameAs(stored);
        assertThat(stored.enabled()).isFalse();
        assertThat(stored.required()).isFalse();
        assertThat(stored.inputs()).isEmpty();
        assertThat(stored.outputIds()).isEmpty();
        assertThat(stored.editor().allowed()).isFalse();
        assertThat(stored.teamId()).isEqualTo(7L);
        assertThat(stored.owner()).isEqualTo("alice");
        assertThat(stored.storeId()).isEqualTo("sp-8k2m4q7x");
        assertThat(stored.steps()).hasSize(1);
        assertThat(stored.steps().get(0).fileParameters()).isEmpty();
        assertThat(stored.steps().get(0).parameters()).containsEntry("optimizeLevel", 6);
        verify(policyValidator).validateSteps(stored.steps());
        verify(policyValidator).validateChain(stored.steps());
    }

    @Test
    void suffixesANameThatAlreadyExistsInTheTeam() {
        when(policyManagementAuthority.canEditPolicies()).thenReturn(true);
        when(policyAccessGuard.teamForNewPolicy()).thenReturn(7L);
        when(policyStore.findByTeam(7L))
                .thenReturn(
                        List.of(
                                existing("Board pack archive"),
                                existing("Board pack archive (2)")));
        when(policyStore.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Policy saved = controller().importPipeline(request("Board pack archive")).getBody();

        assertThat(saved.name()).isEqualTo("Board pack archive (3)");
    }

    @Test
    void rejectsAnEmptyChain() {
        when(policyManagementAuthority.canEditPolicies()).thenReturn(true);
        var empty =
                new PolicyImportController.PolicyImportRequest("Name", "route", "sp-1", List.of());

        assertThatThrownBy(() -> controller().importPipeline(empty))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private static Policy existing(String name) {
        return new Policy(
                "id-" + name, name, "alice", true, List.of(), List.of(), null, List.of(), 7L);
    }

    private static Policy stored(String surface) {
        return new Policy(
                        "p1",
                        "Lock and shrink",
                        "alice",
                        true,
                        List.of(),
                        List.of(
                                new PipelineStep(
                                        "/api/v1/security/add-password",
                                        Map.of("password", "hunter2", "keyLength", 256),
                                        Map.of())),
                        new OutputSpec("s3", Map.of("secretAccessKey", "shh")),
                        List.of("dest-1"),
                        7L)
                .withSurface(surface);
    }

    @Test
    void storeExportBlanksSecretsAndDropsOutputSettings() {
        when(policyManagementAuthority.canEditPolicies()).thenReturn(true);
        Policy policy = stored(Policy.SURFACE_POLICY);
        when(policyStore.get("p1")).thenReturn(Optional.of(policy));
        when(policyAccessGuard.canAccess(policy)).thenReturn(true);

        Policy export = controller().storeExport("p1");

        // The setting stays so the store still marks it as set on install; the value never leaves.
        assertThat(export.steps().get(0).parameters())
                .containsEntry("password", "")
                .containsEntry("keyLength", 256);
        assertThat(export.output().options()).isEmpty();
        assertThat(export.outputIds()).containsExactly("dest-1");
    }

    @Test
    void storeExportIsNotOfferedForAProcessingFolder() {
        when(policyManagementAuthority.canEditPolicies()).thenReturn(true);
        when(policyStore.get("p1")).thenReturn(Optional.of(stored("processing-folder")));

        assertThatThrownBy(() -> controller().storeExport("p1"))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void storeLinkSavesTheListingIdAndRefusesAnythingElse() {
        when(policyManagementAuthority.canEditPolicies()).thenReturn(true);
        Policy policy = stored(Policy.SURFACE_POLICY);
        when(policyStore.get("p1")).thenReturn(Optional.of(policy));
        when(policyAccessGuard.canAccess(policy)).thenReturn(true);
        when(policyStore.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Policy linked =
                controller()
                        .linkToStore(
                                "p1", new PolicyImportController.StoreLinkRequest("sp-8k2m4q7x"));
        assertThat(linked.storeId()).isEqualTo("sp-8k2m4q7x");

        assertThatThrownBy(
                        () ->
                                controller()
                                        .linkToStore(
                                                "p1",
                                                new PolicyImportController.StoreLinkRequest(
                                                        "stirling-security")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
