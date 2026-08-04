package stirling.software.proprietary.integration.controller;

import java.security.Principal;

import io.quarkus.security.identity.SecurityIdentity;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.access.service.ResourceAccessService;
import stirling.software.proprietary.integration.dto.IntegrationConfigRequest;
import stirling.software.proprietary.integration.service.IntegrationConfigService;
import stirling.software.proprietary.security.model.User;

/** CRUD for S3/MCP/API integration configs. Secrets are never returned. */
@ApplicationScoped
@Path("/api/v1/integrations")
@Produces(MediaType.APPLICATION_JSON)
@RequiredArgsConstructor
// Portal-exclusive: server-side portal-access boundary, not just isAuthenticated. Per-config
// ownership is still enforced in the service layer.
@Tag(name = "Integrations", description = "Manage S3/MCP/API integration configurations")
public class IntegrationConfigController {

    private final IntegrationConfigService service;
    private final ResourceAccessService accessService;

    // Field-injected so @RequiredArgsConstructor stays a pure collaborator constructor.
    @Inject SecurityIdentity securityIdentity;

    @GET
    public Response list() {
        User user = requirePortalUser();
        return Response.ok(
                        service.listVisible(user).stream()
                                .map(c -> service.toResponse(c, user))
                                .toList())
                .build();
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    public Response create(IntegrationConfigRequest request) {
        User user = requirePortalUser();
        return Response.ok(service.toResponse(service.create(request, user), user)).build();
    }

    /**
     * What this caller may set up, so the UI offers the vendor presets and the free-form "custom
     * API" option only to those who can actually use them. The answer is computed here rather than
     * inferred client-side: hiding a button is presentation, and the service still refuses the call
     * regardless of what the client believed.
     */
    @GET
    @Path("/capabilities")
    public Response capabilities() {
        User user = requirePortalUser();
        return Response.ok(new IntegrationCapabilitiesResponse(service.canAuthorCustomApi(user)))
                .build();
    }

    /**
     * @param customApi whether the caller may author a free-form API integration
     */
    public record IntegrationCapabilitiesResponse(boolean customApi) {}

    @GET
    @Path("/{id}")
    public Response get(@PathParam("id") Long id) {
        User user = requirePortalUser();
        return Response.ok(service.toResponse(service.getForUse(id, user), user)).build();
    }

    @PUT
    @Path("/{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response update(@PathParam("id") Long id, IntegrationConfigRequest request) {
        User user = requirePortalUser();
        return Response.ok(service.toResponse(service.update(id, request, user), user)).build();
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") Long id) {
        User user = requirePortalUser();
        service.delete(id, user);
        return Response.noContent().build();
    }

    // Replaces the class-level @PreAuthorize("@resourceAccess.canUsePortal()"): Quarkus has no SpEL
    // gate, so every endpoint resolves the caller and clears the portal boundary before any work.
    private User requirePortalUser() {
        User user = currentUser();
        if (user == null) {
            throw new WebApplicationException(
                    "Authentication required", Response.Status.UNAUTHORIZED);
        }
        if (!accessService.canAccessPortal(user)) {
            throw new WebApplicationException("Portal access required", Response.Status.FORBIDDEN);
        }
        return user;
    }

    // The User entity is the principal, attached by UserSecurityIdentityAugmentor; Spring's
    // SecurityContextHolder is never populated on RESTEasy threads.
    private User currentUser() {
        if (securityIdentity == null || securityIdentity.isAnonymous()) {
            return null;
        }
        Principal principal = securityIdentity.getPrincipal();
        return principal instanceof User user ? user : null;
    }
}
