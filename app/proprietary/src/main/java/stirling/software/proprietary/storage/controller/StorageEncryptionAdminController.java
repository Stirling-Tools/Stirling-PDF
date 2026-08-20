package stirling.software.proprietary.storage.controller;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import io.quarkus.panache.common.Sort;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.PersistenceException;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.security.Authentication;
import stirling.software.common.security.SecurityContextHolder;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.service.AuditService;
import stirling.software.proprietary.storage.crypto.FileEncryptionKeyService;
import stirling.software.proprietary.storage.crypto.StorageEncryptionException;
import stirling.software.proprietary.storage.crypto.StorageEncryptionState;
import stirling.software.proprietary.storage.model.FileEncryptionKey;
import stirling.software.proprietary.storage.model.api.StorageEncryptionStatusResponse;
import stirling.software.proprietary.storage.repository.FileEncryptionKeyRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.storage.service.StorageEncryptionMigrationService;

/**
 * Admin surface for storage encryption at rest: status/backup verification, the per-scope kill
 * switch, the encrypt-existing migration, and master-key rotation. Deliberately no delete endpoint
 * — key material can be disabled but never destroyed through the API.
 */
@ApplicationScoped
@Path("/api/v1/admin/storage-encryption")
@RolesAllowed("ADMIN")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Admin: Storage Encryption", description = "Encryption-at-rest administration")
public class StorageEncryptionAdminController {

    private final ApplicationProperties applicationProperties;
    private final StorageEncryptionState encryptionState;
    private final FileEncryptionKeyRepository keyRepository;
    private final StoredFileRepository storedFileRepository;
    private final StorageEncryptionMigrationService migrationService;
    private final AuditService auditService;

    /**
     * Reports write state, master-key fingerprint and encrypted/plaintext counts. Refuses rather
     * than reading the registry when storage is off, because a deployment that never stores files
     * may not have the table at all — the same reason the decorator's boot probe is gated.
     */
    @GET
    @Path("/status")
    @Produces(MediaType.APPLICATION_JSON)
    public StorageEncryptionStatusResponse status() {
        if (!applicationProperties.getStorage().isEnabled()) {
            throw new WebApplicationException("Storage is disabled", Response.Status.FORBIDDEN);
        }
        try {
            return buildStatus();
        } catch (PersistenceException e) {
            log.warn("Could not read storage encryption status: {}", e.getMessage());
            throw new WebApplicationException(
                    "The storage encryption key registry could not be read",
                    e,
                    Response.Status.SERVICE_UNAVAILABLE);
        }
    }

    private StorageEncryptionStatusResponse buildStatus() {
        List<StorageEncryptionStatusResponse.KeyInfo> keys =
                keyRepository.listAll(Sort.by("createdAt")).stream()
                        .map(
                                k ->
                                        new StorageEncryptionStatusResponse.KeyInfo(
                                                k.getKeyId(),
                                                k.getScopeType().name(),
                                                k.getScopeId(),
                                                k.getKeyVersion(),
                                                k.getMasterKeyVersion(),
                                                k.getStatus().name(),
                                                k.getCreatedAt(),
                                                k.getStatusChangedAt(),
                                                k.getStatusChangedBy()))
                        .toList();
        String fingerprint = null;
        Integer masterKeyVersion = null;
        if (encryptionState.isMaterialised()) {
            try {
                FileEncryptionKeyService keyService = encryptionState.keyService();
                fingerprint = keyService.masterKey().fingerprint();
                masterKeyVersion = keyService.masterKey().currentVersion();
            } catch (StorageEncryptionException ignored) {
                // Materialisation failed; status still reports counts and key rows.
            }
        }
        return new StorageEncryptionStatusResponse(
                encryptionState.isWriteEnabled(),
                encryptionState.isMaterialised(),
                fingerprint,
                masterKeyVersion,
                storedFileRepository.countByEncryptionKeyIdIsNotNull(),
                storedFileRepository.countByEncryptionKeyIdIsNull(),
                keys);
    }

    /** Kill switch: content under this key fails closed (403) until re-enabled. Reversible. */
    @POST
    @Path("/keys/{keyId}/disable")
    @Produces(MediaType.APPLICATION_JSON)
    public StorageEncryptionStatusResponse.KeyInfo disableKey(@PathParam("keyId") UUID keyId) {
        FileEncryptionKey row = setStatus(keyId, FileEncryptionKey.Status.DISABLED);
        auditService.audit(
                AuditEventType.STORAGE_ENCRYPTION,
                Map.of("action", "key.disabled", "keyId", keyId.toString()));
        return toKeyInfo(row);
    }

    /**
     * Reverses the kill switch: only DISABLED keys can be enabled, and they come back ACTIVE unless
     * the scope acquired another active key while revoked, in which case they come back RETIRED —
     * readable, but not a second key wrapping new writes. The response carries the resulting
     * status.
     */
    @POST
    @Path("/keys/{keyId}/enable")
    @Produces(MediaType.APPLICATION_JSON)
    public StorageEncryptionStatusResponse.KeyInfo enableKey(@PathParam("keyId") UUID keyId) {
        FileEncryptionKey existing =
                keyRepository
                        .findByIdOptional(keyId)
                        .orElseThrow(
                                () ->
                                        new WebApplicationException(
                                                "No such encryption key",
                                                Response.Status.NOT_FOUND));
        if (existing.getStatus() != FileEncryptionKey.Status.DISABLED) {
            throw new WebApplicationException(
                    "Key is not disabled (status: " + existing.getStatus() + ")",
                    Response.Status.CONFLICT);
        }
        FileEncryptionKeyService keyService = requireKeyService();
        FileEncryptionKey row;
        try {
            row = keyService.enable(keyId, currentUsername());
        } catch (StorageEncryptionException e) {
            throw new WebApplicationException(e.getMessage(), e, Response.Status.NOT_FOUND);
        }
        auditService.audit(
                AuditEventType.STORAGE_ENCRYPTION,
                Map.of(
                        "action",
                        "key.enabled",
                        "keyId",
                        keyId.toString(),
                        "status",
                        row.getStatus().name()));
        return toKeyInfo(row);
    }

    @POST
    @Path("/migrate")
    @Produces(MediaType.APPLICATION_JSON)
    public MigrationStatusResponse startMigration() {
        try {
            return MigrationStatusResponse.from(migrationService.start());
        } catch (IllegalStateException e) {
            throw new WebApplicationException(e.getMessage(), e, Response.Status.CONFLICT);
        }
    }

    @GET
    @Path("/migrate/status")
    @Produces(MediaType.APPLICATION_JSON)
    public MigrationStatusResponse migrationStatus() {
        return migrationService
                .status()
                .map(MigrationStatusResponse::from)
                .orElse(MigrationStatusResponse.IDLE);
    }

    /**
     * Re-wraps KEK rows below the configured master-key version under the primary master key. Key
     * material is never accepted over HTTP — new keys arrive via config/env and a restart; this
     * endpoint only performs the re-wrap step of the rotation runbook.
     */
    @POST
    @Path("/master/rotate")
    @Produces(MediaType.APPLICATION_JSON)
    public Map<String, Object> rotateMasterKey() {
        FileEncryptionKeyService keyService = requireKeyService();
        int rewrapped;
        try {
            rewrapped = keyService.rotateMasterKey();
        } catch (StorageEncryptionException e) {
            throw new WebApplicationException(
                    "Rotation failed: " + e.getMessage(), e, Response.Status.INTERNAL_SERVER_ERROR);
        }
        auditService.audit(
                AuditEventType.STORAGE_ENCRYPTION,
                Map.of(
                        "action",
                        "master.rotated",
                        "rowsRewrapped",
                        rewrapped,
                        "masterKeyVersion",
                        keyService.masterKey().currentVersion()));
        return Map.of(
                "rewrapped",
                rewrapped,
                "masterKeyVersion",
                keyService.masterKey().currentVersion());
    }

    private FileEncryptionKey setStatus(UUID keyId, FileEncryptionKey.Status status) {
        FileEncryptionKeyService keyService = requireKeyService();
        try {
            return keyService.setKeyStatus(keyId, status, currentUsername());
        } catch (StorageEncryptionException e) {
            throw new WebApplicationException(e.getMessage(), e, Response.Status.NOT_FOUND);
        }
    }

    private FileEncryptionKeyService requireKeyService() {
        try {
            return encryptionState.keyService();
        } catch (StorageEncryptionException e) {
            throw new WebApplicationException(
                    "Storage encryption is not configured: " + e.getMessage(),
                    e,
                    Response.Status.CONFLICT);
        }
    }

    private static String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null ? auth.getName() : "system";
    }

    private static StorageEncryptionStatusResponse.KeyInfo toKeyInfo(FileEncryptionKey k) {
        return new StorageEncryptionStatusResponse.KeyInfo(
                k.getKeyId(),
                k.getScopeType().name(),
                k.getScopeId(),
                k.getKeyVersion(),
                k.getMasterKeyVersion(),
                k.getStatus().name(),
                k.getCreatedAt(),
                k.getStatusChangedAt(),
                k.getStatusChangedBy());
    }

    public record MigrationStatusResponse(
            String state,
            Long total,
            Long processed,
            Long skipped,
            Long failed,
            Instant startedAt,
            Instant finishedAt) {

        static final MigrationStatusResponse IDLE =
                new MigrationStatusResponse("IDLE", null, null, null, null, null, null);

        static MigrationStatusResponse from(StorageEncryptionMigrationService.MigrationStatus s) {
            return new MigrationStatusResponse(
                    s.state().name(),
                    s.total(),
                    s.processed(),
                    s.skipped(),
                    s.failed(),
                    s.startedAt(),
                    s.finishedAt());
        }
    }
}
