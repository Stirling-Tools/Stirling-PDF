package stirling.software.saas.payg.policy.admin;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import io.quarkus.arc.profile.IfBuildProfile;

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
@ApplicationScoped
@Path("/api/v1/admin/payg")
@IfBuildProfile("saas")
@Tag(name = "PAYG Admin - Pricing Policy", description = "Admin CRUD for pricing policies")
@RequiredArgsConstructor
@Slf4j
public class PricingPolicyAdminController {

    private final PricingPolicyService policyService;

    @GET
    @Path("/policies")
    @RolesAllowed("ADMIN")
    @Operation(summary = "List all pricing policies (admin)")
    public Response listPolicies() {
        return Response.ok(policyService.listAll().stream().map(PolicyResponse::from).toList())
                .build();
    }

    @GET
    @Path("/policies/{policyId}")
    @RolesAllowed("ADMIN")
    @Operation(summary = "Get a single pricing policy by id (admin)")
    public Response getPolicy(@PathParam("policyId") Long policyId) {
        return policyService
                .findById(policyId)
                .map(p -> Response.ok(PolicyResponse.from(p)).build())
                .orElseGet(() -> Response.status(Response.Status.NOT_FOUND).build());
    }

    @POST
    @Path("/policies")
    @Consumes(MediaType.APPLICATION_JSON)
    @RolesAllowed("ADMIN")
    @Operation(
            summary = "Create a new pricing policy (admin)",
            description =
                    "Creates a non-default policy. To promote to default, call set-default after"
                            + " creation.")
    public Response createPolicy(CreatePolicyRequest req) {
        try {
            PricingPolicy draft = mapCreateRequest(req);
            PricingPolicy saved = policyService.create(draft);
            return Response.status(Response.Status.CREATED)
                    .entity(PolicyResponse.from(saved))
                    .build();
        } catch (IllegalArgumentException e) {
            return Response.status(Response.Status.BAD_REQUEST).entity(error(e.getMessage())).build();
        }
    }

    @POST
    @Path("/policies/{policyId}/set-default")
    @RolesAllowed("ADMIN")
    @Operation(
            summary = "Promote a policy to default (admin)",
            description =
                    "Atomically clears the existing default flag and sets this row's flag."
                            + " Teams without an override use the default.")
    public Response setDefault(@PathParam("policyId") Long policyId) {
        try {
            PricingPolicy promoted = policyService.setDefault(policyId);
            return Response.ok(PolicyResponse.from(promoted)).build();
        } catch (IllegalArgumentException e) {
            return Response.status(Response.Status.NOT_FOUND).entity(error(e.getMessage())).build();
        }
    }

    @PUT
    @Path("/teams/{teamId}/policy-override")
    @Consumes(MediaType.APPLICATION_JSON)
    @RolesAllowed("ADMIN")
    @Operation(
            summary = "Set or clear a team's per-team pricing-policy override (admin)",
            description =
                    "Payload {policyId: <id>} sets the override; {policyId: null} clears it"
                            + " (team falls back to default).")
    public Response setTeamOverride(
            @PathParam("teamId") Long teamId, TeamOverrideRequest req) {
        try {
            policyService.setTeamOverride(teamId, req == null ? null : req.policyId());
            return Response.noContent().build();
        } catch (IllegalArgumentException | IllegalStateException e) {
            Response.Status status =
                    e instanceof IllegalStateException
                            ? Response.Status.NOT_FOUND
                            : Response.Status.BAD_REQUEST;
            return Response.status(status).entity(error(e.getMessage())).build();
        }
    }

    @GET
    @Path("/teams/{teamId}/effective-policy")
    @RolesAllowed("ADMIN")
    @Operation(
            summary = "Read the effective policy for a team (admin)",
            description =
                    "Returns the override if set, else the default. Bypasses the read cache so"
                            + " admins always see the latest state.")
    public Response getEffectivePolicy(@PathParam("teamId") Long teamId) {
        return Response.ok(PolicyResponse.from(policyService.getEffectivePolicyUncached(teamId)))
                .build();
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
