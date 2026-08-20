package stirling.software.proprietary.storage.repository;

import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepository;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.workflow.model.WorkflowSession;

/**
 * Quarkus Panache repository for {@link StoredFile}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository<StoredFile, Long>}. Derived finders are
 * reimplemented as Panache queries; each original {@code @Query} keeps its JPQL string. The
 * {@code @Modifying @Query} bulk UPDATE keeps its JPQL passed to Panache {@code update}. Spring
 * Data CRUD helpers the callers relied on ({@code save}, {@code saveAll}, {@code deleteAll}) are
 * provided as thin shims over the Panache API so collaborating services compile unchanged.
 */
@ApplicationScoped
public class StoredFileRepository implements PanacheRepository<StoredFile> {

    public Optional<StoredFile> findByIdAndOwner(Long id, User owner) {
        return find("id = ?1 and owner = ?2", id, owner).firstResultOptional();
    }

    public Optional<StoredFile> findByIdAndOwnerWithShares(Long id, User owner) {
        return find(
                        "SELECT DISTINCT f FROM StoredFile f "
                                + "LEFT JOIN FETCH f.owner "
                                + "LEFT JOIN FETCH f.shares s "
                                + "LEFT JOIN FETCH s.sharedWithUser "
                                + "WHERE f.id = ?1 AND f.owner = ?2",
                        id,
                        owner)
                .firstResultOptional();
    }

    public Optional<StoredFile> findByIdWithShares(Long id) {
        return find(
                        "SELECT DISTINCT f FROM StoredFile f "
                                + "LEFT JOIN FETCH f.owner "
                                + "LEFT JOIN FETCH f.shares s "
                                + "LEFT JOIN FETCH s.sharedWithUser "
                                + "WHERE f.id = ?1",
                        id)
                .firstResultOptional();
    }

    public List<StoredFile> findAccessibleFiles(User user) {
        return find(
                        "SELECT DISTINCT f FROM StoredFile f "
                                + "LEFT JOIN FETCH f.owner "
                                + "LEFT JOIN FETCH f.shares s "
                                + "LEFT JOIN FETCH s.sharedWithUser "
                                + "WHERE f.owner = ?1 "
                                + "OR s.sharedWithUser = ?1",
                        user)
                .list();
    }

    public long sumStorageBytesByOwner(User owner) {
        return find(
                        "SELECT COALESCE(SUM(f.sizeBytes + COALESCE(f.historySizeBytes, 0) "
                                + "+ COALESCE(f.auditLogSizeBytes, 0)), 0) "
                                + "FROM StoredFile f WHERE f.owner = ?1",
                        owner)
                .project(Long.class)
                .firstResult();
    }

    public long sumStorageBytesTotal() {
        return find("SELECT COALESCE(SUM(f.sizeBytes + COALESCE(f.historySizeBytes, 0) "
                        + "+ COALESCE(f.auditLogSizeBytes, 0)), 0) "
                        + "FROM StoredFile f")
                .project(Long.class)
                .firstResult();
    }

    /** Finds all files associated with a workflow session. */
    public List<StoredFile> findByWorkflowSession(WorkflowSession workflowSession) {
        return find("workflowSession", workflowSession).list();
    }

    public List<StoredFile> findAllByOwner(User owner) {
        return find("owner", owner).list();
    }

    /**
     * Bulk lookup used by the folder-placement controller. Returns only files owned by {@code
     * owner}; ids that don't exist or that belong to another user are silently dropped so the
     * caller can compute the "skipped" set by subtraction.
     */
    public List<StoredFile> findAllByIdInAndOwner(List<Long> ids, User owner) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return find("id in ?1 and owner = ?2", ids, owner).list();
    }

    @Transactional
    public void clearWorkflowSessionReferencesByOwner(User user) {
        update(
                "UPDATE StoredFile sf SET sf.workflowSession = null "
                        + "WHERE sf.workflowSession IN "
                        + "(SELECT ws FROM WorkflowSession ws WHERE ws.owner = ?1)",
                user);
    }

    // ---- storage encryption at rest ----------------------------------------------------

    public long countByEncryptionKeyIdIsNull() {
        return count("encryptionKeyId is null");
    }

    public long countByEncryptionKeyIdIsNotNull() {
        return count("encryptionKeyId is not null");
    }

    /**
     * Next batch of plaintext files for the encrypt-existing migration. Cursor-based ({@code id >
     * lastId}) so per-file failures don't wedge the loop, and owner is fetched eagerly because the
     * job re-stores blobs under the owner's scope key outside a web transaction.
     */
    public List<StoredFile> findMigratableAfter(long lastId, int limit) {
        return find(
                        "SELECT f FROM StoredFile f JOIN FETCH f.owner "
                                + "WHERE f.encryptionKeyId IS NULL AND f.id > ?1 ORDER BY f.id ASC",
                        lastId)
                .page(0, limit)
                .list();
    }

    /**
     * Compare-and-swap updates for the migration: each blob's storage key only flips if it still
     * holds the value the job read, so a user replacing the file mid-migration wins and the job
     * discards its own copy. The main-blob swap also stamps the key id, which is what removes the
     * row from the migration's selection.
     */
    @Transactional
    public int swapMainBlob(Long id, String oldKey, String newKey, String keyId) {
        return update(
                "UPDATE StoredFile f SET f.storageKey = ?1, f.encryptionKeyId = ?2 "
                        + "WHERE f.id = ?3 AND f.storageKey = ?4",
                newKey,
                keyId,
                id,
                oldKey);
    }

    @Transactional
    public int swapHistoryBlob(Long id, String oldKey, String newKey) {
        return update(
                "UPDATE StoredFile f SET f.historyStorageKey = ?1 "
                        + "WHERE f.id = ?2 AND f.historyStorageKey = ?3",
                newKey,
                id,
                oldKey);
    }

    @Transactional
    public int swapAuditLogBlob(Long id, String oldKey, String newKey) {
        return update(
                "UPDATE StoredFile f SET f.auditLogStorageKey = ?1 "
                        + "WHERE f.id = ?2 AND f.auditLogStorageKey = ?3",
                newKey,
                id,
                oldKey);
    }

    // --- Spring Data CRUD shims kept so collaborating services compile unchanged ---

    /**
     * Spring Data {@code save(file)}. Panache {@code persist} inserts a new entity and relies on
     * dirty-checking to update a managed one; the returned instance keeps the original
     * save-returns-entity contract.
     */
    @Transactional
    public StoredFile save(StoredFile file) {
        persist(file);
        return file;
    }

    /** Spring Data {@code saveAll(files)} -> Panache {@code persist} over the collection. */
    @Transactional
    public List<StoredFile> saveAll(Iterable<StoredFile> files) {
        persist(files);
        if (files instanceof List<StoredFile> list) {
            return list;
        }
        java.util.List<StoredFile> result = new java.util.ArrayList<>();
        files.forEach(result::add);
        return result;
    }

    /** Spring Data {@code deleteAll(files)} -> delete each managed entity. */
    @Transactional
    public void deleteAll(Iterable<StoredFile> files) {
        files.forEach(this::delete);
    }
}
