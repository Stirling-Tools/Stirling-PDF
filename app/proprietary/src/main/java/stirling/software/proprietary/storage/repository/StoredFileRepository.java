package stirling.software.proprietary.storage.repository;

import java.util.List;
import java.util.Optional;

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

    @Modifying
    @Transactional
    @Query(
            "UPDATE StoredFile sf SET sf.workflowSession = null "
                    + "WHERE sf.workflowSession IN "
                    + "(SELECT ws FROM WorkflowSession ws WHERE ws.owner = :user)")
    void clearWorkflowSessionReferencesByOwner(@Param("user") User user);
}
