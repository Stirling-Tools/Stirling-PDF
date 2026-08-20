package stirling.software.proprietary.policy.asset;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.github.pixee.security.Filenames;
import io.quarkus.arc.profile.IfBuildProfile;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Stored supporting files for pipelines: the certificate/image/overlay a step needs beyond its
 * document stream. Uploaded when a pipeline is built, persisted server-side, and referenced from a
 * step's {@code fileParameters} as {@code asset:<id>} - so triggered and scheduled runs have the
 * file without anyone re-supplying it. Team-scoped exactly like the policies that reference them.
 */
@ApplicationScoped
@IfBuildProfile("saas")
@Path("/api/v1/policies/assets")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Policies", description = "Run tool pipelines on the backend")
public class PolicyAssetController {

    /** Defensive cap; supporting files (certs, images, overlay PDFs) are far smaller. */
    private static final long MAX_ASSET_BYTES = 50L * 1024 * 1024;

    private final PolicyAssetStore assetStore;
    private final PolicyStore policyStore;
    private final PolicyAccessGuard policyAccessGuard;
    private final PolicyManagementAuthority policyManagementAuthority;
    private final ApplicationProperties applicationProperties;

    @POST
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Upload a pipeline supporting file",
            description =
                    "Stores a supporting file (multipart field 'file') for pipeline steps to"
                            + " reference from their fileParameters as 'asset:<id>', and returns"
                            + " its metadata including the assigned id.")
    public PolicyAsset upload(@RestForm("file") FileUpload fileUpload) throws IOException {
        requirePolicyEditingAllowed();
        MultipartFile file = FileUploadMultipartFile.of(fileUpload);
        if (file == null || file.isEmpty()) {
            throw new WebApplicationException(
                    "Uploaded file is empty", Response.Status.BAD_REQUEST);
        }
        if (file.getSize() > MAX_ASSET_BYTES) {
            throw new WebApplicationException(
                    "Supporting files may be at most " + (MAX_ASSET_BYTES / (1024 * 1024)) + " MB",
                    Response.Status.BAD_REQUEST);
        }
        String fileName = Filenames.toSimpleFileName(file.getOriginalFilename());
        if (fileName == null || fileName.isBlank()) {
            fileName = "asset";
        }
        PolicyAsset meta =
                new PolicyAsset(
                        null,
                        fileName,
                        file.getContentType(),
                        file.getSize(),
                        policyAccessGuard.ownerForNewPolicy(),
                        policyAccessGuard.teamForNewPolicy(),
                        System.currentTimeMillis());
        return assetStore.save(meta, file.getBytes());
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "List stored supporting files",
            description =
                    "Lists the supporting files visible to the caller's team (metadata only), so"
                            + " the builder can show which file a step's binding points at.")
    public List<PolicyAsset> list() {
        return policyAccessGuard.visibleFrom(assetStore);
    }

    @GET
    @Path("/{assetId}/content")
    @Operation(
            summary = "Download a stored supporting file",
            description =
                    "Returns the asset's bytes with its stored content type and filename. Gated"
                            + " like upload and delete: supporting files include signing"
                            + " certificates, so reading the bytes back needs the same authority"
                            + " that put them there, not merely team membership.")
    public Response content(@PathParam("assetId") String assetId) {
        requirePolicyEditingAllowed();
        PolicyAsset asset = accessibleAsset(assetId);
        byte[] bytes =
                assetStore
                        .content(assetId)
                        .orElseThrow(
                                () ->
                                        new WebApplicationException(
                                                "No asset: " + assetId, Response.Status.NOT_FOUND));
        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM_TYPE;
        try {
            if (asset.contentType() != null) {
                mediaType = MediaType.valueOf(asset.contentType());
            }
        } catch (RuntimeException ignored) {
            // Stored content type unparsable: serve as a generic binary.
        }
        return Response.ok(bytes, mediaType)
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        contentDispositionAttachment(asset.fileName()))
                .build();
    }

    @DELETE
    @Path("/{assetId}")
    @Operation(
            summary = "Delete a stored supporting file",
            description =
                    "Removes an asset no pipeline references. An asset still referenced by a"
                            + " pipeline's step returns 409 - remove or replace the binding first."
                            + " (Assets are also cleaned up automatically when the pipelines"
                            + " referencing them are saved without them or deleted.)")
    public Response delete(@PathParam("assetId") String assetId) {
        requirePolicyEditingAllowed();
        accessibleAsset(assetId);
        boolean referenced =
                policyAccessGuard.visibleFrom(policyStore).stream()
                        .anyMatch(
                                policy ->
                                        PolicyAssetRefs.referencedAssetIds(policy.steps())
                                                .contains(assetId));
        if (referenced) {
            throw new WebApplicationException(
                    "Asset is still referenced by a pipeline step", Response.Status.CONFLICT);
        }
        assetStore.delete(assetId);
        return Response.noContent().build();
    }

    /** The asset, scoped to the caller's team - another team's asset reads as not-found. */
    private PolicyAsset accessibleAsset(String assetId) {
        return assetStore
                .get(assetId)
                .filter(policyAccessGuard::canAccess)
                .orElseThrow(
                        () ->
                                new WebApplicationException(
                                        "No asset: " + assetId, Response.Status.NOT_FOUND));
    }

    /** Same gate as policy edits (see {@code PolicyController#requirePolicyEditingAllowed}). */
    private void requirePolicyEditingAllowed() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return;
        }
        if (!policyManagementAuthority.canEditPolicies()) {
            throw new WebApplicationException(
                    "Policies may only be created or modified by a team leader",
                    Response.Status.FORBIDDEN);
        }
    }

    /**
     * {@code Content-Disposition: attachment} with an RFC 5987 UTF-8 filename, mirroring Spring's
     * {@code ContentDisposition.attachment().filename(name, UTF_8)} so a non-ASCII filename encodes
     * rather than mangling.
     */
    private static String contentDispositionAttachment(String filename) {
        String encoded = URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");
        return "attachment; filename=\"" + filename + "\"; filename*=UTF-8''" + encoded;
    }
}
