package stirling.software.proprietary.storage.crypto;

import java.util.Map;
import java.util.UUID;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.service.AuditService;

/**
 * Bridges storage-encryption events into the audit trail. Per-read decrypt events can be noisy on
 * busy installs, so they honour {@code storage.encryption.auditReads}; denials and key lifecycle
 * events are always recorded.
 */
public class AuditingStorageEncryptionListener implements StorageEncryptionAuditListener {

    private final AuditService auditService;
    private final boolean auditReads;

    public AuditingStorageEncryptionListener(AuditService auditService, boolean auditReads) {
        this.auditService = auditService;
        this.auditReads = auditReads;
    }

    @Override
    public void encrypted(String storageKey, UUID keyId) {
        auditService.audit(
                AuditEventType.STORAGE_ENCRYPTION,
                Map.of("action", "encrypt", "storageKey", storageKey, "keyId", keyId.toString()));
    }

    @Override
    public void decrypted(String storageKey, UUID keyId) {
        if (!auditReads) {
            return;
        }
        auditService.audit(
                AuditEventType.STORAGE_ENCRYPTION,
                Map.of("action", "decrypt", "storageKey", storageKey, "keyId", keyId.toString()));
    }

    @Override
    public void decryptDenied(UUID keyId, String reason) {
        auditService.audit(
                AuditEventType.STORAGE_ENCRYPTION,
                Map.of("action", "decrypt.denied", "keyId", keyId.toString(), "reason", reason));
    }

    @Override
    public void keyCreated(UUID keyId, String scope, int version) {
        auditService.audit(
                AuditEventType.STORAGE_ENCRYPTION,
                Map.of(
                        "action",
                        "key.created",
                        "keyId",
                        keyId.toString(),
                        "scope",
                        scope,
                        "keyVersion",
                        version));
    }
}
