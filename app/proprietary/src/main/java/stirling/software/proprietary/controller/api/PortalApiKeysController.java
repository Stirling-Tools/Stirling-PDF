package stirling.software.proprietary.controller.api;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.api.ProprietaryUiDataApi;
import stirling.software.proprietary.model.api.apikey.CreateApiKeyRequest;
import stirling.software.proprietary.security.service.ApiKeyManagementService;

/**
 * Real backing for the portal Infrastructure → API Keys tab: list/create/revoke named, personal API
 * keys. Replaces the former portal-only mock endpoint. Not gated behind an Enterprise license - API
 * keys are a core auth feature available on every self-hosted instance.
 */
@ApplicationScoped
@ProprietaryUiDataApi
@Path("/api/v1/proprietary/ui-data")
@RequiredArgsConstructor
public class PortalApiKeysController {

    private final ApiKeyManagementService apiKeyManagementService;

    // tier accepted for endpoint symmetry with the other infra tabs; ignored here.
    @GET
    @Path("/infrastructure/api-keys")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(summary = "List API keys", description = "The caller's personal API keys.")
    public Response list(@QueryParam("tier") String tier) {
        return Response.ok(apiKeyManagementService.listVisibleKeys()).build();
    }

    @POST
    @Path("/infrastructure/api-keys")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Create an API key",
            description = "Mints a personal key and returns its one-time secret.")
    public Response create(CreateApiKeyRequest request) {
        return Response.ok(apiKeyManagementService.createKey(request)).build();
    }

    @DELETE
    @Path("/infrastructure/api-keys/{id}")
    @Operation(summary = "Revoke an API key", description = "Disables a key the caller owns.")
    public Response revoke(@PathParam("id") Long id) {
        apiKeyManagementService.revokeKey(id);
        return Response.noContent().build();
    }
}
