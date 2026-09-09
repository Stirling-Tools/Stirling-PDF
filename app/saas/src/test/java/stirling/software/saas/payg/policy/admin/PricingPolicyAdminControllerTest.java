package stirling.software.saas.payg.policy.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.policy.PricingPolicyService;
import stirling.software.saas.payg.policy.admin.PolicyDtos.CreatePolicyRequest;
import stirling.software.saas.payg.policy.admin.PolicyDtos.PolicyResponse;
import stirling.software.saas.payg.policy.admin.PolicyDtos.TeamOverrideRequest;

/**
 * Tests {@link PricingPolicyAdminController} as a plain Java unit (no MockMvc layer). Covers happy
 * paths and the controller's error mapping (4xx for validation, 404 for missing rows).
 */
@ExtendWith(MockitoExtension.class)
class PricingPolicyAdminControllerTest {

    @Mock private PricingPolicyService service;

    private PricingPolicyAdminController controller;

    @BeforeEach
    void setUp() {
        controller = new PricingPolicyAdminController(service);
    }

    @Test
    void listPolicies_returnsAll() {
        when(service.listAll())
                .thenReturn(List.of(policy(1L, "v1", true), policy(2L, "v2", false)));

        ResponseEntity<List<PolicyResponse>> resp = controller.listPolicies();

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).hasSize(2);
        assertThat(resp.getBody().get(0).version()).isEqualTo("v1");
    }

    @Test
    void getPolicy_returnsOk() {
        when(service.findById(1L)).thenReturn(Optional.of(policy(1L, "v1", true)));

        ResponseEntity<PolicyResponse> resp = controller.getPolicy(1L);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().policyId()).isEqualTo(1L);
    }

    @Test
    void getPolicy_missingReturns404() {
        when(service.findById(999L)).thenReturn(Optional.empty());

        ResponseEntity<PolicyResponse> resp = controller.getPolicy(999L);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void createPolicy_happyPath() {
        CreatePolicyRequest req =
                new CreatePolicyRequest(
                        "v2",
                        LocalDateTime.now(),
                        null,
                        25,
                        5L * 1024 * 1024,
                        1,
                        1000,
                        null,
                        null,
                        "notes",
                        "admin@example.com");
        PricingPolicy saved = policy(99L, "v2", false);
        ArgumentCaptor<PricingPolicy> draft = ArgumentCaptor.forClass(PricingPolicy.class);
        when(service.create(draft.capture())).thenReturn(saved);

        ResponseEntity<?> resp = controller.createPolicy(req);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(((PolicyResponse) resp.getBody()).policyId()).isEqualTo(99L);
        assertThat(draft.getValue().getVersion()).isEqualTo("v2");
        // Controller must never let isDefault=true through to the service — setDefault is the
        // only path for promotion.
        assertThat(draft.getValue().getIsDefault()).isFalse();
    }

    @Test
    void createPolicy_missingVersion_returns400() {
        CreatePolicyRequest req =
                new CreatePolicyRequest(
                        null, null, null, 25, 5L * 1024 * 1024, 1, 1000, null, null, null, null);

        ResponseEntity<?> resp = controller.createPolicy(req);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verifyNoInteractions(service);
    }

    @Test
    void createPolicy_missingDocFields_returns400() {
        CreatePolicyRequest req =
                new CreatePolicyRequest(
                        "v2", null, null, null, null, 1, 1000, null, null, null, null);

        ResponseEntity<?> resp = controller.createPolicy(req);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verifyNoInteractions(service);
    }

    @Test
    void setDefault_returnsOk() {
        when(service.setDefault(2L)).thenReturn(policy(2L, "v2-promoted", true));

        ResponseEntity<?> resp = controller.setDefault(2L);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(((PolicyResponse) resp.getBody()).isDefault()).isTrue();
    }

    @Test
    void setDefault_unknownId_returns404() {
        when(service.setDefault(999L))
                .thenThrow(new IllegalArgumentException("No pricing_policy with id 999"));

        ResponseEntity<?> resp = controller.setDefault(999L);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void setTeamOverride_noContent() {
        TeamOverrideRequest req = new TeamOverrideRequest(2L);

        ResponseEntity<?> resp = controller.setTeamOverride(42L, req);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(service).setTeamOverride(42L, 2L);
    }

    @Test
    void setTeamOverride_nullBody_clearsOverride() {
        // Curl with no body, or {} → req == null is handled as "clear".
        ResponseEntity<?> resp = controller.setTeamOverride(42L, null);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(service).setTeamOverride(42L, null);
    }

    @Test
    void setTeamOverride_unknownPolicy_returns400() {
        TeamOverrideRequest req = new TeamOverrideRequest(999L);
        org.mockito.Mockito.doThrow(new IllegalArgumentException("No pricing_policy with id 999"))
                .when(service)
                .setTeamOverride(42L, 999L);

        ResponseEntity<?> resp = controller.setTeamOverride(42L, req);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void setTeamOverride_missingTeamExtensions_returns404() {
        TeamOverrideRequest req = new TeamOverrideRequest(2L);
        org.mockito.Mockito.doThrow(new IllegalStateException("No payg_team_extensions row"))
                .when(service)
                .setTeamOverride(42L, 2L);

        ResponseEntity<?> resp = controller.setTeamOverride(42L, req);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void getEffectivePolicy_bypassesCache() {
        when(service.getEffectivePolicyUncached(42L)).thenReturn(policy(1L, "v1", true));

        ResponseEntity<PolicyResponse> resp = controller.getEffectivePolicy(42L);

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().version()).isEqualTo("v1");
        verify(service).getEffectivePolicyUncached(42L);
    }

    @Test
    void policyResponse_collectionsAreDefensiveCopies() {
        PricingPolicy p = policy(1L, "v1", true);
        p.setStepLimits(new java.util.HashMap<>(Map.of()));
        p.setStripePriceIds(new java.util.HashSet<>());

        PolicyResponse resp = PolicyResponse.from(p);

        // Mutating the source after building the response should not affect the response.
        p.getStepLimits().put(stirling.software.saas.payg.model.JobSource.WEB, 99);
        p.getStripePriceIds().add("price_xyz");
        assertThat(resp.stepLimits()).isEmpty();
        assertThat(resp.stripePriceIds()).isEmpty();
    }

    private static PricingPolicy policy(Long id, String version, boolean isDefault) {
        PricingPolicy p = new PricingPolicy();
        p.setId(id);
        p.setVersion(version);
        p.setEffectiveFrom(LocalDateTime.now());
        p.setDocPagesPerUnit(25);
        p.setDocBytesPerUnit(5L * 1024 * 1024);
        p.setMinChargeUnits(1);
        p.setFileUnitCap(1000);
        p.setIsDefault(isDefault);
        return p;
    }
}
