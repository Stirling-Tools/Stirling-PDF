package stirling.software.proprietary.storage.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.storage.model.FileEncryptionKey;

@Repository
public interface FileEncryptionKeyRepository extends JpaRepository<FileEncryptionKey, UUID> {

    Optional<FileEncryptionKey> findFirstByScopeTypeAndScopeIdAndStatus(
            FileEncryptionKey.ScopeType scopeType, long scopeId, FileEncryptionKey.Status status);

    Optional<FileEncryptionKey> findFirstByScopeTypeAndScopeIdOrderByKeyVersionDesc(
            FileEncryptionKey.ScopeType scopeType, long scopeId);

    Optional<FileEncryptionKey> findFirstByStatus(FileEncryptionKey.Status status);
}
