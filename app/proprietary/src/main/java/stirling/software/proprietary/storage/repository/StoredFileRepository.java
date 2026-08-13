package stirling.software.proprietary.storage.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.workflow.model.WorkflowSession;

public interface StoredFileRepository extends JpaRepository<StoredFile, Long> {
    Optional<StoredFile> findByIdAndOwner(Long id, User owner);

    @Query(
            "SELECT DISTINCT f FROM StoredFile f "
                    + "LEFT JOIN FETCH f.owner "
                    + "LEFT JOIN FETCH f.shares s "
                    + "LEFT JOIN FETCH s.sharedWithUser "
                    + "WHERE f.id = :id AND f.owner = :owner")
    Optional<StoredFile> findByIdAndOwnerWithShares(
            @Param("id") Long id, @Param("owner") User owner);

    @Query(
            "SELECT DISTINCT f FROM StoredFile f "
                    + "LEFT JOIN FETCH f.owner "
                    + "LEFT JOIN FETCH f.shares s "
                    + "LEFT JOIN FETCH s.sharedWithUser "
                    + "WHERE f.id = :id")
    Optional<StoredFile> findByIdWithShares(@Param("id") Long id);

    @Query(
            "SELECT DISTINCT f FROM StoredFile f "
                    + "LEFT JOIN FETCH f.owner "
                    + "LEFT JOIN FETCH f.shares s "
                    + "LEFT JOIN FETCH s.sharedWithUser "
                    + "WHERE f.owner = :user "
                    + "OR s.sharedWithUser = :user")
    List<StoredFile> findAccessibleFiles(@Param("user") User user);

    @Query(
            "SELECT COALESCE(SUM(f.sizeBytes + COALESCE(f.historySizeBytes, 0) "
                    + "+ COALESCE(f.auditLogSizeBytes, 0)), 0) "
                    + "FROM StoredFile f WHERE f.owner = :owner")
    long sumStorageBytesByOwner(@Param("owner") User owner);

    @Query(
            "SELECT COALESCE(SUM(f.sizeBytes + COALESCE(f.historySizeBytes, 0) "
                    + "+ COALESCE(f.auditLogSizeBytes, 0)), 0) "
                    + "FROM StoredFile f")
    long sumStorageBytesTotal();

    /** Finds all files associated with a workflow session. */
    List<StoredFile> findByWorkflowSession(WorkflowSession workflowSession);

    List<StoredFile> findAllByOwner(User owner);

    /** Every file placed in the given storage folder — the working set of a processing folder. */
    List<StoredFile> findAllByFolderId(UUID folderId);

    /**
     * A file's folder placement as a plain id. Reads the FK directly so callers outside a
     * transaction never touch the lazy {@code folder} association.
     */
    @Query("SELECT sf.folder.id FROM StoredFile sf WHERE sf.id = :fileId")
    Optional<UUID> findFolderIdByFileId(@Param("fileId") Long fileId);

    /**
     * Set a file's folder placement by id, without loading the entity. Writes the FK directly so a
     * caller with no persistence context (a policy run's worker thread) can restore placement
     * without going through a merge of a detached entity.
     */
    @Modifying
    @Transactional
    @Query(
            value = "UPDATE stored_files SET folder_id = :folderId WHERE stored_file_id = :fileId",
            nativeQuery = true)
    void updateFolderId(@Param("fileId") Long fileId, @Param("folderId") UUID folderId);

    /**
     * Bulk lookup used by the folder-placement controller. Returns only files owned by {@code
     * owner}; ids that don't exist or that belong to another user are silently dropped so the
     * caller can compute the "skipped" set by subtraction.
     */
    List<StoredFile> findAllByIdInAndOwner(List<Long> ids, User owner);

    @Modifying
    @Transactional
    @Query(
            "UPDATE StoredFile sf SET sf.workflowSession = null "
                    + "WHERE sf.workflowSession IN "
                    + "(SELECT ws FROM WorkflowSession ws WHERE ws.owner = :user)")
    void clearWorkflowSessionReferencesByOwner(@Param("user") User user);

    // ---- storage encryption at rest ----------------------------------------------------

    long countByEncryptionKeyIdIsNull();

    long countByEncryptionKeyIdIsNotNull();

    /**
     * Next batch of plaintext files for the encrypt-existing migration. Cursor-based ({@code id >
     * lastId}) so per-file failures don't wedge the loop, and owner is fetched eagerly because the
     * job re-stores blobs under the owner's scope key outside a web transaction.
     */
    @Query(
            "SELECT f FROM StoredFile f JOIN FETCH f.owner "
                    + "WHERE f.encryptionKeyId IS NULL AND f.id > :lastId ORDER BY f.id ASC")
    List<StoredFile> findMigratableAfter(@Param("lastId") long lastId, Pageable pageable);

    /**
     * Compare-and-swap updates for the migration: each blob's storage key only flips if it still
     * holds the value the job read, so a user replacing the file mid-migration wins and the job
     * discards its own copy. The main-blob swap also stamps the key id, which is what removes the
     * row from the migration's selection.
     */
    @Modifying
    @Transactional
    @Query(
            "UPDATE StoredFile f SET f.storageKey = :newKey, f.encryptionKeyId = :keyId "
                    + "WHERE f.id = :id AND f.storageKey = :oldKey")
    int swapMainBlob(
            @Param("id") Long id,
            @Param("oldKey") String oldKey,
            @Param("newKey") String newKey,
            @Param("keyId") String keyId);

    @Modifying
    @Transactional
    @Query(
            "UPDATE StoredFile f SET f.historyStorageKey = :newKey "
                    + "WHERE f.id = :id AND f.historyStorageKey = :oldKey")
    int swapHistoryBlob(
            @Param("id") Long id, @Param("oldKey") String oldKey, @Param("newKey") String newKey);

    @Modifying
    @Transactional
    @Query(
            "UPDATE StoredFile f SET f.auditLogStorageKey = :newKey "
                    + "WHERE f.id = :id AND f.auditLogStorageKey = :oldKey")
    int swapAuditLogBlob(
            @Param("id") Long id, @Param("oldKey") String oldKey, @Param("newKey") String newKey);
}
