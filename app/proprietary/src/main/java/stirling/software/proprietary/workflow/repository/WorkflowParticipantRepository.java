package stirling.software.proprietary.workflow.repository;

import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Parameters;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;

/**
 * Quarkus Panache repository for {@link WorkflowParticipant}.
 *
 * <p>Migrated from a Spring Data {@code JpaRepository<WorkflowParticipant, Long>}. Derived finders
 * are reimplemented as Panache queries; the {@code @Query}-annotated methods preserve their
 * original JPQL strings via {@code find(...)} / {@code update(...)} / {@code delete(...)}.
 */
@ApplicationScoped
public class WorkflowParticipantRepository implements PanacheRepository<WorkflowParticipant> {

    /** Find participant by share token */
    public Optional<WorkflowParticipant> findByShareToken(String shareToken) {
        return find("shareToken", shareToken).firstResultOptional();
    }

    /** Find all participants in a workflow session */
    public List<WorkflowParticipant> findByWorkflowSession(WorkflowSession session) {
        return list("workflowSession", session);
    }

    /** Find participant by session and user */
    public Optional<WorkflowParticipant> findByWorkflowSessionAndUser(
            WorkflowSession session, User user) {
        return find("workflowSession = ?1 and user = ?2", session, user).firstResultOptional();
    }

    /** Find participant by session and email */
    public Optional<WorkflowParticipant> findByWorkflowSessionAndEmail(
            WorkflowSession session, String email) {
        return find("workflowSession = ?1 and email = ?2", session, email).firstResultOptional();
    }

    /** Find all participants with a specific status in a session */
    public List<WorkflowParticipant> findByWorkflowSessionAndStatus(
            WorkflowSession session, ParticipantStatus status) {
        return list("workflowSession = ?1 and status = ?2", session, status);
    }

    /** Find all sessions where a user is a participant */
    public List<WorkflowParticipant> findByUserOrderByLastUpdatedDesc(User user) {
        return list("user = ?1 order by lastUpdated desc", user);
    }

    /** Find all sessions where an email is a participant */
    public List<WorkflowParticipant> findByEmailOrderByLastUpdatedDesc(String email) {
        return list("email = ?1 order by lastUpdated desc", email);
    }

    /** Check if a participant exists by share token */
    public boolean existsByShareToken(String shareToken) {
        return count("shareToken", shareToken) > 0;
    }

    /** Count participants in a session by status */
    public long countByWorkflowSessionAndStatus(WorkflowSession session, ParticipantStatus status) {
        return count("workflowSession = ?1 and status = ?2", session, status);
    }

    /** Find expired participants that haven't completed */
    public List<WorkflowParticipant> findExpiredIncompleteParticipants() {
        return list("expiresAt < CURRENT_TIMESTAMP AND status NOT IN ('SIGNED', 'DECLINED')");
    }

    /** Find all participants pending notification */
    public List<WorkflowParticipant> findPendingNotifications() {
        return list("status = 'PENDING' AND workflowSession.status = 'IN_PROGRESS'");
    }

    /** Delete participant by ID and session owner (for authorization) */
    @Transactional
    public void deleteByIdAndSessionOwner(Long participantId, User owner) {
        delete(
                "id = :participantId AND workflowSession.owner = :owner",
                Parameters.with("participantId", participantId).and("owner", owner));
    }

    /**
     * Null out the user reference for all participants linked to the given user. Used during user
     * deletion to preserve workflow audit history while removing the personal data link.
     * Participants in sessions owned by others are retained but de-linked from the deleted account.
     */
    @Transactional
    public void clearUserReferences(User user) {
        update("user = null WHERE user = :user", Parameters.with("user", user));
    }
}
