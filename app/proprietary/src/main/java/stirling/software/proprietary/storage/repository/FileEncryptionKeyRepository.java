package stirling.software.proprietary.storage.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import io.quarkus.panache.common.Sort;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.proprietary.storage.model.FileEncryptionKey;

/**
 * Quarkus Panache repository for {@link FileEncryptionKey}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository<FileEncryptionKey, UUID>}; the derived
 * finders become explicit Panache queries. Callers map {@code findById -> findByIdOptional} and
 * {@code saveAndFlush -> persistAndFlush}.
 */
@ApplicationScoped
public class FileEncryptionKeyRepository implements PanacheRepositoryBase<FileEncryptionKey, UUID> {

    /**
     * Ordered so that if a scope ever holds more than one row in the given status, every node picks
     * the same one instead of following database row order.
     */
    public Optional<FileEncryptionKey> findFirstByScopeTypeAndScopeIdAndStatusOrderByKeyVersionDesc(
            FileEncryptionKey.ScopeType scopeType, long scopeId, FileEncryptionKey.Status status) {
        return find(
                        "scopeType = ?1 and scopeId = ?2 and status = ?3",
                        Sort.descending("keyVersion"),
                        scopeType,
                        scopeId,
                        status)
                .firstResultOptional();
    }

    public Optional<FileEncryptionKey> findFirstByScopeTypeAndScopeIdOrderByKeyVersionDesc(
            FileEncryptionKey.ScopeType scopeType, long scopeId) {
        return find(
                        "scopeType = ?1 and scopeId = ?2",
                        Sort.descending("keyVersion"),
                        scopeType,
                        scopeId)
                .firstResultOptional();
    }

    public Optional<FileEncryptionKey> findFirstByStatus(FileEncryptionKey.Status status) {
        return find("status", status).firstResultOptional();
    }

    /**
     * Rows still wrapped by an older master key. Counting and fetching are separate so the startup
     * check can ask the database for a number instead of materialising every row.
     */
    public long countByMasterKeyVersionLessThan(int masterKeyVersion) {
        return count("masterKeyVersion < ?1", masterKeyVersion);
    }

    public List<FileEncryptionKey> findByMasterKeyVersionLessThan(int masterKeyVersion) {
        return find("masterKeyVersion < ?1", masterKeyVersion).list();
    }

    /**
     * Rows wrapped by a version the configuration has since gone below. Rotation only re-wraps rows
     * <em>under</em> the configured version, so these can never be re-wrapped.
     */
    public long countByMasterKeyVersionGreaterThan(int masterKeyVersion) {
        return count("masterKeyVersion > ?1", masterKeyVersion);
    }

    /** Spring Data's {@code saveAndFlush}: flushes so a constraint violation surfaces here. */
    public FileEncryptionKey saveAndFlush(FileEncryptionKey row) {
        persistAndFlush(row);
        return row;
    }

    /** Spring Data's {@code save}: merge, since a rotated key row is updated in place. */
    public FileEncryptionKey save(FileEncryptionKey row) {
        return getEntityManager().merge(row);
    }
}
