package stirling.software.proprietary.workflow.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.model.WorkflowType;

@Repository
public interface WorkflowSessionRepository extends JpaRepository<WorkflowSession, Long> {

    /** Find workflow session by unique session ID */
    Optional<WorkflowSession> findBySessionId(String sessionId);

    /** Find workflow session by unique session ID with participants eagerly loaded */
    @Query(
            "SELECT ws FROM WorkflowSession ws LEFT JOIN FETCH ws.participants WHERE ws.sessionId = :sessionId")
    Optional<WorkflowSession> findBySessionIdWithParticipants(@Param("sessionId") String sessionId);

    /** Find all workflow sessions owned by a specific user */
    List<WorkflowSession> findByOwnerOrderByCreatedAtDesc(User owner);

    /** Find all workflow sessions of a specific type for a user */
    List<WorkflowSession> findByOwnerAndWorkflowTypeOrderByCreatedAtDesc(
            User owner, WorkflowType workflowType);

    /** Find all workflow sessions with a specific status */
    List<WorkflowSession> findByStatusOrderByCreatedAtDesc(WorkflowStatus status);

    /** Find all active (non-finalized, in-progress) sessions for a user */
    @Query(
            "SELECT ws FROM WorkflowSession ws WHERE ws.owner = :owner AND ws.status = 'IN_PROGRESS' AND ws.finalized = false ORDER BY ws.createdAt DESC")
    List<WorkflowSession> findActiveSessionsByOwner(@Param("owner") User owner);

    /** Find all finalized sessions for a user */
    List<WorkflowSession> findByOwnerAndFinalizedTrueOrderByCreatedAtDesc(User owner);

    /** Check if a session exists by session ID */
    boolean existsBySessionId(String sessionId);

    /** Find sessions that need cleanup (e.g., old cancelled sessions) */
    @Query(
            "SELECT ws FROM WorkflowSession ws WHERE ws.status = 'CANCELLED' AND ws.updatedAt < :cutoffDate")
    List<WorkflowSession> findCancelledSessionsOlderThan(
            @Param("cutoffDate") java.time.LocalDateTime cutoffDate);

    /** Count active sessions for a user */
    @Query(
            "SELECT COUNT(ws) FROM WorkflowSession ws WHERE ws.owner = :owner AND ws.status = 'IN_PROGRESS' AND ws.finalized = false")
    long countActiveSessionsByOwner(@Param("owner") User owner);

    /** Delete session by session ID and owner (for authorization) */
    void deleteBySessionIdAndOwner(String sessionId, User owner);
}
