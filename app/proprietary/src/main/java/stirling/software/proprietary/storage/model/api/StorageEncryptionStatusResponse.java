package stirling.software.proprietary.storage.model.api;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Admin view of storage encryption at rest. The master-key fingerprint (SHA-256 prefix, never key
 * material) lets admins verify their key backup matches the live key.
 */
public record StorageEncryptionStatusResponse(
        boolean writeEnabled,
        boolean active,
        String masterKeyFingerprint,
        Integer masterKeyVersion,
        /** Where the master key came from: config, environment or generated. */
        String masterKeySource,
        /** Backend serving stored blobs: local, database or s3. */
        String provider,
        long encryptedFiles,
        long plaintextFiles,
        /** Key rows still wrapped by an older master key, counted in the database. */
        long pendingRotationRows,
        List<KeyInfo> keys) {

    public record KeyInfo(
            UUID keyId,
            String scopeType,
            long scopeId,
            int keyVersion,
            int masterKeyVersion,
            String status,
            LocalDateTime createdAt,
            LocalDateTime statusChangedAt,
            String statusChangedBy) {}
}
