package stirling.software.proprietary.access.controller;

import java.security.Principal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import io.quarkus.security.identity.SecurityIdentity;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.access.model.AccessPermission;
import stirling.software.proprietary.access.model.PrincipalType;
import stirling.software.proprietary.access.model.ResourceGrant;
import stirling.software.proprietary.access.model.ResourceType;
import stirling.software.proprietary.access.service.ResourceAccessService;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;

/** Admin endpoints to grant/revoke access to gated resources (the portal, integration configs). */
@ApplicationScoped
@Path("/api/v1/admin/access")
@RequiredArgsConstructor
@RolesAllowed("ADMIN")
@Tag(name = "Access Control", description = "Manage resource access grants (portal, integrations)")
public class ResourceGrantController {

    private final ResourceAccessService accessService;
    private final UserRepository userRepository;
    private final TeamRepository teamRepository;

    // Quarkus stand-in for @AuthenticationPrincipal: UserSecurityIdentityAugmentor attaches the
    // User entity to SecurityIdentity. Field injection keeps the @RequiredArgsConstructor stable.
    @Inject SecurityIdentity securityIdentity;

    @GET
    @Path("/grants")
    @Produces(MediaType.APPLICATION_JSON)
    public Response list(
            @QueryParam("resourceType") ResourceType resourceType,
            @QueryParam("resourceId") @DefaultValue("") String resourceId) {
        requireParam(resourceType, "resourceType", "ResourceType");
        List<ResourceGrant> grants = accessService.listGrants(resourceType, resourceId);
        return Response.ok(grants.stream().map(this::toDto).toList()).build();
    }

    @GET
    @Path("/grants/by-principal")
    @Produces(MediaType.APPLICATION_JSON)
    public Response listByPrincipal(
            @QueryParam("principalType") PrincipalType principalType,
            @QueryParam("principalId") Long principalId) {
        requireParam(principalType, "principalType", "PrincipalType");
        requireParam(principalId, "principalId", "Long");
        List<ResourceGrant> grants =
                accessService.listGrantsForPrincipal(principalType, principalId);
        return Response.ok(grants.stream().map(this::toDto).toList()).build();
    }

    @POST
    @Path("/grants")
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(GrantRequest request) {
        if (request == null
                || request.resourceType() == null
                || request.principalType() == null
                || request.principalId() == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            Map.of(
                                    "error",
                                    "resourceType, principalType and principalId are required"))
                    .build();
        }
        // PORTAL is a singleton (empty resourceId); every other type must name a resource.
        boolean portal = request.resourceType() == ResourceType.PORTAL;
        if (!portal && (request.resourceId() == null || request.resourceId().isBlank())) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", "resourceId is required for " + request.resourceType()))
                    .build();
        }
        Long principalId = request.principalId();
        String principalError = validatePrincipalExists(request.principalType(), principalId);
        if (principalError != null) {
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(Map.of("error", principalError))
                    .build();
        }
        AccessPermission permission =
                request.permission() == null ? AccessPermission.USE : request.permission();
        String resourceId = portal ? "" : request.resourceId();
        User admin = currentUser();
        ResourceGrant grant =
                accessService.grant(
                        request.resourceType(),
                        resourceId,
                        request.principalType(),
                        principalId,
                        permission,
                        admin);
        return Response.ok(toDto(grant)).build();
    }

    @DELETE
    @Path("/grants/{id}")
    @Produces(MediaType.APPLICATION_JSON)
    public Response delete(@PathParam("id") Long id) {
        accessService.revoke(id);
        return Response.ok(Map.of("message", "Grant revoked")).build();
    }

    // Rejects grants to nonexistent principals (dead rows otherwise). Panache has no existsById,
    // so the existence probe is a count by id.
    private String validatePrincipalExists(PrincipalType type, Long id) {
        return switch (type) {
            case USER ->
                    userRepository.count("id", id) > 0 ? null : "User " + id + " does not exist";
            case TEAM ->
                    teamRepository.count("id", id) > 0 ? null : "Team " + id + " does not exist";
        };
    }

    // Null when the principal is not a User entity, matching what @AuthenticationPrincipal bound;
    // ResourceAccessService.grant leaves grantedBy untouched in that case.
    private User currentUser() {
        if (securityIdentity == null || securityIdentity.isAnonymous()) {
            return null;
        }
        Principal principal = securityIdentity.getPrincipal();
        return principal instanceof User user ? user : null;
    }

    // A missing query param binds to null under JAX-RS, where Spring rejected a required
    // @RequestParam with 400; the status and wording are reproduced here.
    private static void requireParam(Object value, String name, String type) {
        if (value == null) {
            throw new WebApplicationException(
                    "Required parameter '" + name + "' of type '" + type + "' is missing",
                    Response.Status.BAD_REQUEST);
        }
    }

    private Map<String, Object> toDto(ResourceGrant g) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", g.getId());
        m.put("resourceType", g.getResourceType());
        m.put("resourceId", g.getResourceId());
        m.put("principalType", g.getPrincipalType());
        m.put("principalId", g.getPrincipalId());
        m.put("permission", g.getPermission());
        m.put("createdAt", g.getCreatedAt());
        return m;
    }

    /** Request body for creating a grant. */
    public record GrantRequest(
            ResourceType resourceType,
            String resourceId,
            PrincipalType principalType,
            Long principalId,
            AccessPermission permission) {}
}
