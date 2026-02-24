package stirling.software.proprietary.storage.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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
                    + "OR (s.sharedWithUser = :user AND s.workflowParticipant IS NULL)")
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
}
