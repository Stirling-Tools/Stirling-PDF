package stirling.software.proprietary.storage.crypto;

import java.util.UUID;

/**
 * Security-event hook for the storage-encryption layer. The crypto classes stay plain (non-Spring)
 * objects, so audit emission is injected through this interface; production wires {@link
 * AuditingStorageEncryptionListener}, tests default to {@link #NOOP}.
 */
public interface StorageEncryptionAuditListener {

    StorageEncryptionAuditListener NOOP = new StorageEncryptionAuditListener() {};

    default void encrypted(String storageKey, UUID keyId) {}

    default void decrypted(String storageKey, UUID keyId) {}

    default void decryptDenied(UUID keyId, String reason) {}

    default void keyCreated(UUID keyId, String scope, int version) {}
}
