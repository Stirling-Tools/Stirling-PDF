package stirling.software.proprietary.storage.repository;

import java.util.List;
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

    /**
     * Rows still wrapped by an older master key. Counting and fetching are separate so the startup
     * check can ask the database for a number instead of materialising every row.
     */
    long countByMasterKeyVersionLessThan(int masterKeyVersion);

    List<FileEncryptionKey> findByMasterKeyVersionLessThan(int masterKeyVersion);
}
