package stirling.software.proprietary.storage.repository;

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

    public Optional<FileEncryptionKey> findFirstByScopeTypeAndScopeIdAndStatus(
            FileEncryptionKey.ScopeType scopeType, long scopeId, FileEncryptionKey.Status status) {
        return find("scopeType = ?1 and scopeId = ?2 and status = ?3", scopeType, scopeId, status)
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

    /** Spring Data's {@code saveAndFlush}: flushes so a constraint violation surfaces here. */
    public FileEncryptionKey saveAndFlush(FileEncryptionKey row) {
        persistAndFlush(row);
        return row;
    }
}
