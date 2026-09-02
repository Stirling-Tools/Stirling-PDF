package stirling.software.proprietary.workflow.repository;

import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Sort;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowStatus;
import stirling.software.proprietary.workflow.model.WorkflowType;

@ApplicationScoped
public class WorkflowSessionRepository implements PanacheRepository<WorkflowSession> {

    /** Find workflow session by unique session ID */
    public Optional<WorkflowSession> findBySessionId(String sessionId) {
        return find("sessionId", sessionId).firstResultOptional();
    }

    /** Find workflow session by unique session ID with participants eagerly loaded */
    public Optional<WorkflowSession> findBySessionIdWithParticipants(String sessionId) {
        return find(
                        "SELECT ws FROM WorkflowSession ws LEFT JOIN FETCH ws.participants WHERE ws.sessionId = :sessionId",
                        io.quarkus.panache.common.Parameters.with("sessionId", sessionId))
                .firstResultOptional();
    }

    /** Find all workflow sessions owned by a specific user */
    public List<WorkflowSession> findByOwnerOrderByCreatedAtDesc(User owner) {
        return list("owner", Sort.by("createdAt", Sort.Direction.Descending), owner);
    }

    /** Find all workflow sessions of a specific type for a user */
    public List<WorkflowSession> findByOwnerAndWorkflowTypeOrderByCreatedAtDesc(
            User owner, WorkflowType workflowType) {
        return list(
                "owner = ?1 and workflowType = ?2",
                Sort.by("createdAt", Sort.Direction.Descending),
                owner,
                workflowType);
    }

    /** Find all workflow sessions with a specific status */
    public List<WorkflowSession> findByStatusOrderByCreatedAtDesc(WorkflowStatus status) {
        return list("status", Sort.by("createdAt", Sort.Direction.Descending), status);
    }

    /** Find all active (non-finalized, in-progress) sessions for a user */
    public List<WorkflowSession> findActiveSessionsByOwner(User owner) {
        return list(
                "SELECT ws FROM WorkflowSession ws WHERE ws.owner = :owner AND ws.status = 'IN_PROGRESS' AND ws.finalized = false ORDER BY ws.createdAt DESC",
                io.quarkus.panache.common.Parameters.with("owner", owner));
    }

    /** Find all finalized sessions for a user */
    public List<WorkflowSession> findByOwnerAndFinalizedTrueOrderByCreatedAtDesc(User owner) {
        return list(
                "owner = ?1 and finalized = true",
                Sort.by("createdAt", Sort.Direction.Descending),
                owner);
    }

    /** Check if a session exists by session ID */
    public boolean existsBySessionId(String sessionId) {
        return count("sessionId", sessionId) > 0;
    }

    /** Find sessions that need cleanup (e.g., old cancelled sessions) */
    public List<WorkflowSession> findCancelledSessionsOlderThan(
            java.time.LocalDateTime cutoffDate) {
        return list(
                "SELECT ws FROM WorkflowSession ws WHERE ws.status = 'CANCELLED' AND ws.updatedAt < :cutoffDate",
                io.quarkus.panache.common.Parameters.with("cutoffDate", cutoffDate));
    }

    /** Count active sessions for a user */
    public long countActiveSessionsByOwner(User owner) {
        return count(
                "owner = :owner and status = 'IN_PROGRESS' and finalized = false",
                io.quarkus.panache.common.Parameters.with("owner", owner));
    }

    /** Delete session by session ID and owner (for authorization) */
    public void deleteBySessionIdAndOwner(String sessionId, User owner) {
        delete("sessionId = ?1 and owner = ?2", sessionId, owner);
    }
}
