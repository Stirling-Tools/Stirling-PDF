package stirling.software.proprietary.storage.controller;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

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
@RestController
@RequestMapping("/api/v1/admin/storage-encryption")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
@Tag(name = "Admin: Storage Encryption", description = "Encryption-at-rest administration")
public class StorageEncryptionAdminController {

    private final StorageEncryptionState encryptionState;
    private final FileEncryptionKeyRepository keyRepository;
    private final StoredFileRepository storedFileRepository;
    private final StorageEncryptionMigrationService migrationService;
    private final AuditService auditService;

    @GetMapping(value = "/status", produces = MediaType.APPLICATION_JSON_VALUE)
    public StorageEncryptionStatusResponse status() {
        List<StorageEncryptionStatusResponse.KeyInfo> keys =
                keyRepository.findAll(Sort.by("createdAt")).stream()
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
        return new StorageEncryptionStatusResponse(
                encryptionState.isWriteEnabled(),
                encryptionState.isActive(),
                encryptionState.keyService().map(s -> s.masterKey().fingerprint()).orElse(null),
                encryptionState.keyService().map(s -> s.masterKey().currentVersion()).orElse(null),
                storedFileRepository.countByEncryptionKeyIdIsNotNull(),
                storedFileRepository.countByEncryptionKeyIdIsNull(),
                keys);
    }

    /** Kill switch: content under this key fails closed (403) until re-enabled. Reversible. */
    @PostMapping("/keys/{keyId}/disable")
    public StorageEncryptionStatusResponse.KeyInfo disableKey(@PathVariable UUID keyId) {
        FileEncryptionKey row = setStatus(keyId, FileEncryptionKey.Status.DISABLED);
        auditService.audit(
                AuditEventType.STORAGE_ENCRYPTION,
                Map.of("action", "key.disabled", "keyId", keyId.toString()));
        return toKeyInfo(row);
    }

    /** Reverses the kill switch. Only DISABLED keys can be enabled (back to ACTIVE). */
    @PostMapping("/keys/{keyId}/enable")
    public StorageEncryptionStatusResponse.KeyInfo enableKey(@PathVariable UUID keyId) {
        FileEncryptionKey existing =
                keyRepository
                        .findById(keyId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "No such encryption key"));
        if (existing.getStatus() != FileEncryptionKey.Status.DISABLED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Key is not disabled (status: " + existing.getStatus() + ")");
        }
        FileEncryptionKey row = setStatus(keyId, FileEncryptionKey.Status.ACTIVE);
        auditService.audit(
                AuditEventType.STORAGE_ENCRYPTION,
                Map.of("action", "key.enabled", "keyId", keyId.toString()));
        return toKeyInfo(row);
    }

    @PostMapping("/migrate")
    public MigrationStatusResponse startMigration() {
        try {
            return MigrationStatusResponse.from(migrationService.start());
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage());
        }
    }

    @GetMapping(value = "/migrate/status", produces = MediaType.APPLICATION_JSON_VALUE)
    public MigrationStatusResponse migrationStatus() {
        StorageEncryptionMigrationService.MigrationStatus status = migrationService.status();
        return status != null ? MigrationStatusResponse.from(status) : MigrationStatusResponse.IDLE;
    }

    /**
     * Re-wraps KEK rows below the configured master-key version under the primary master key. Key
     * material is never accepted over HTTP — new keys arrive via config/env and a restart; this
     * endpoint only performs the re-wrap step of the rotation runbook.
     */
    @PostMapping("/master/rotate")
    public Map<String, Object> rotateMasterKey() {
        FileEncryptionKeyService keyService =
                encryptionState
                        .keyService()
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.CONFLICT,
                                                "Storage encryption is not active"));
        int rewrapped;
        try {
            rewrapped = keyService.rotateMasterKey();
        } catch (StorageEncryptionException e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Rotation failed: " + e.getMessage(), e);
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
        FileEncryptionKeyService keyService =
                encryptionState
                        .keyService()
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.CONFLICT,
                                                "Storage encryption is not active"));
        try {
            return keyService.setKeyStatus(keyId, status, currentUsername());
        } catch (StorageEncryptionException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
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
