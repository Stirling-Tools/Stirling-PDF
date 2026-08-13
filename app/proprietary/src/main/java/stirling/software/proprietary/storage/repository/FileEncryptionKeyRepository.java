package stirling.software.proprietary.storage.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.storage.model.FileEncryptionKey;

@Repository
public interface FileEncryptionKeyRepository extends JpaRepository<FileEncryptionKey, UUID> {

    /**
     * Ordered so that if a scope ever holds more than one row in the given status, every node picks
     * the same one instead of following database row order.
     */
    Optional<FileEncryptionKey> findFirstByScopeTypeAndScopeIdAndStatusOrderByKeyVersionDesc(
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

    /**
     * Rows wrapped by a version the configuration has since gone below. Rotation only re-wraps rows
     * <em>under</em> the configured version, so these can never be re-wrapped.
     */
    long countByMasterKeyVersionGreaterThan(int masterKeyVersion);
}
