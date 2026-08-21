package stirling.software.saas.payg.policy.admin;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.policy.PricingPolicyService;
import stirling.software.saas.payg.policy.admin.PolicyDtos.CreatePolicyRequest;
import stirling.software.saas.payg.policy.admin.PolicyDtos.PolicyResponse;
import stirling.software.saas.payg.policy.admin.PolicyDtos.TeamOverrideRequest;

/**
 * Admin-only CRUD for {@link PricingPolicy} rows + per-team override + default-promotion. Every
 * mutation routes through {@link PricingPolicyService} so the cache invalidation event is published
 * exactly once per mutation, after commit. Reads return live data (no cache) so admins always see
 * their own write.
 *
 * <p>Path namespace {@code /api/v1/admin/payg/...} matches the design's other admin endpoints
 * (cap-setting, cohort migration). Every endpoint requires {@code ROLE_ADMIN}.
 */
@Hidden
@RestController
@RequestMapping("/api/v1/admin/payg")
@Profile("saas")
@Tag(name = "PAYG Admin — Pricing Policy", description = "Admin CRUD for pricing policies")
@RequiredArgsConstructor
@Slf4j
public class PricingPolicyAdminController {

    private final PricingPolicyService policyService;

    @GetMapping("/policies")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "List all pricing policies (admin)")
    public ResponseEntity<List<PolicyResponse>> listPolicies() {
        return ResponseEntity.ok(
                policyService.listAll().stream().map(PolicyResponse::from).toList());
    }

    @GetMapping("/policies/{policyId}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Get a single pricing policy by id (admin)")
    public ResponseEntity<PolicyResponse> getPolicy(@PathVariable Long policyId) {
        return policyService
                .findById(policyId)
                .map(p -> ResponseEntity.ok(PolicyResponse.from(p)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/policies")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(
            summary = "Create a new pricing policy (admin)",
            description =
                    "Creates a non-default policy. To promote to default, call set-default after"
                            + " creation.")
    public ResponseEntity<?> createPolicy(@RequestBody CreatePolicyRequest req) {
        try {
            PricingPolicy draft = mapCreateRequest(req);
            PricingPolicy saved = policyService.create(draft);
            return ResponseEntity.status(HttpStatus.CREATED).body(PolicyResponse.from(saved));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(error(e.getMessage()));
        }
    }

    @PostMapping("/policies/{policyId}/set-default")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(
            summary = "Promote a policy to default (admin)",
            description =
                    "Atomically clears the existing default flag and sets this row's flag."
                            + " Teams without an override use the default.")
    public ResponseEntity<?> setDefault(@PathVariable Long policyId) {
        try {
            PricingPolicy promoted = policyService.setDefault(policyId);
            return ResponseEntity.ok(PolicyResponse.from(promoted));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error(e.getMessage()));
        }
    }

    @PutMapping("/teams/{teamId}/policy-override")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(
            summary = "Set or clear a team's per-team pricing-policy override (admin)",
            description =
                    "Payload {policyId: <id>} sets the override; {policyId: null} clears it"
                            + " (team falls back to default).")
    public ResponseEntity<?> setTeamOverride(
            @PathVariable Long teamId, @RequestBody TeamOverrideRequest req) {
        try {
            policyService.setTeamOverride(teamId, req == null ? null : req.policyId());
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException | IllegalStateException e) {
            HttpStatus status =
                    e instanceof IllegalStateException
                            ? HttpStatus.NOT_FOUND
                            : HttpStatus.BAD_REQUEST;
            return ResponseEntity.status(status).body(error(e.getMessage()));
        }
    }

    @GetMapping("/teams/{teamId}/effective-policy")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(
            summary = "Read the effective policy for a team (admin)",
            description =
                    "Returns the override if set, else the default. Bypasses the read cache so"
                            + " admins always see the latest state.")
    public ResponseEntity<PolicyResponse> getEffectivePolicy(@PathVariable Long teamId) {
        return ResponseEntity.ok(
                PolicyResponse.from(policyService.getEffectivePolicyUncached(teamId)));
    }

    private static PricingPolicy mapCreateRequest(CreatePolicyRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("Request body required.");
        }
        if (req.version() == null || req.version().isBlank()) {
            throw new IllegalArgumentException("version is required.");
        }
        if (req.docPagesPerUnit() == null || req.docBytesPerUnit() == null) {
            throw new IllegalArgumentException("docPagesPerUnit and docBytesPerUnit are required.");
        }
        PricingPolicy p = new PricingPolicy();
        p.setVersion(req.version());
        p.setEffectiveFrom(req.effectiveFrom() != null ? req.effectiveFrom() : LocalDateTime.now());
        p.setEffectiveTo(req.effectiveTo());
        p.setDocPagesPerUnit(req.docPagesPerUnit());
        p.setDocBytesPerUnit(req.docBytesPerUnit());
        p.setMinChargeUnits(req.minChargeUnits() != null ? req.minChargeUnits() : 1);
        p.setFileUnitCap(req.fileUnitCap() != null ? req.fileUnitCap() : 1000);
        p.setStepLimits(
                req.stepLimits() != null ? new HashMap<>(req.stepLimits()) : new HashMap<>());
        p.setStripePriceIds(
                req.stripePriceIds() != null
                        ? new HashSet<>(req.stripePriceIds())
                        : new HashSet<>());
        p.setIsDefault(false);
        p.setNotes(req.notes());
        p.setCreatedBy(req.createdBy());
        return p;
    }

    private static java.util.Map<String, String> error(String message) {
        return java.util.Map.of("error", message == null ? "unknown" : message);
    }
}
