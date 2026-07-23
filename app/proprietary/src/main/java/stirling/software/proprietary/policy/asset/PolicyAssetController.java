package stirling.software.proprietary.policy.asset;

import java.io.IOException;
import java.util.List;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Stored supporting files for pipelines: the certificate/image/overlay a step needs beyond its
 * document stream. Uploaded when a pipeline is built, persisted server-side, and referenced from a
 * step's {@code fileParameters} by asset id — so triggered and scheduled runs have the file without
 * anyone re-supplying it. Team-scoped exactly like the policies that reference them.
 */
@RestController
@RequestMapping("/api/v1/policies/assets")
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

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Upload a pipeline supporting file",
            description =
                    "Stores a supporting file (multipart field 'file') for pipeline steps to"
                            + " reference from their fileParameters, and returns its metadata"
                            + " including the assigned id.")
    public ResponseEntity<PolicyAsset> upload(@RequestPart("file") MultipartFile file)
            throws IOException {
        requirePolicyEditingAllowed();
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Uploaded file is empty");
        }
        if (file.getSize() > MAX_ASSET_BYTES) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Supporting files may be at most " + (MAX_ASSET_BYTES / (1024 * 1024)) + " MB");
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
        return ResponseEntity.ok(assetStore.save(meta, file.getBytes()));
    }

    @GetMapping
    @Operation(
            summary = "List stored supporting files",
            description =
                    "Lists the supporting files visible to the caller's team (metadata only), so"
                            + " the builder can show which file a step's binding points at.")
    public List<PolicyAsset> list() {
        return policyAccessGuard.visibleFrom(assetStore);
    }

    @GetMapping("/{assetId}/content")
    @Operation(
            summary = "Download a stored supporting file",
            description = "Returns the asset's bytes with its stored content type and filename.")
    public ResponseEntity<Resource> content(@PathVariable String assetId) {
        PolicyAsset asset = accessibleAsset(assetId);
        byte[] bytes =
                assetStore
                        .content(assetId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "No asset: " + assetId));
        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        try {
            if (asset.contentType() != null) {
                mediaType = MediaType.parseMediaType(asset.contentType());
            }
        } catch (RuntimeException ignored) {
            // Stored content type unparsable: serve as a generic binary.
        }
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(
                        "Content-Disposition",
                        ContentDisposition.attachment()
                                .filename(asset.fileName())
                                .build()
                                .toString())
                .body(new ByteArrayResource(bytes));
    }

    @DeleteMapping("/{assetId}")
    @Operation(
            summary = "Delete a stored supporting file",
            description =
                    "Removes an asset no pipeline references. An asset still referenced by a"
                            + " pipeline's step returns 409 - remove or replace the binding first."
                            + " (Assets are also cleaned up automatically when the pipelines"
                            + " referencing them are saved without them or deleted.)")
    public ResponseEntity<Void> delete(@PathVariable String assetId) {
        requirePolicyEditingAllowed();
        accessibleAsset(assetId);
        boolean referenced =
                policyAccessGuard.visibleFrom(policyStore).stream()
                        .anyMatch(
                                policy ->
                                        PolicyAssetRefs.referencedAssetIds(policy.steps())
                                                .contains(assetId));
        if (referenced) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "Asset is still referenced by a pipeline step");
        }
        assetStore.delete(assetId);
        return ResponseEntity.noContent().build();
    }

    /** The asset, scoped to the caller's team — another team's asset reads as not-found. */
    private PolicyAsset accessibleAsset(String assetId) {
        return assetStore
                .get(assetId)
                .filter(policyAccessGuard::canAccess)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "No asset: " + assetId));
    }

    /** Same gate as policy edits (see {@code PolicyController#requirePolicyEditingAllowed}). */
    private void requirePolicyEditingAllowed() {
        if (!applicationProperties.getSecurity().isEnableLogin()) {
            return;
        }
        if (!policyManagementAuthority.canEditPolicies()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Policies may only be created or modified by a team leader");
        }
    }
}
