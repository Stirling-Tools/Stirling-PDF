package stirling.software.proprietary.workflow.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.workflow.model.ParticipantStatus;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;

@Repository
public interface WorkflowParticipantRepository extends JpaRepository<WorkflowParticipant, Long> {

    /** Find participant by share token */
    Optional<WorkflowParticipant> findByShareToken(String shareToken);

    /** Find all participants in a workflow session */
    List<WorkflowParticipant> findByWorkflowSession(WorkflowSession session);

    /** Find participant by session and user */
    Optional<WorkflowParticipant> findByWorkflowSessionAndUser(WorkflowSession session, User user);

    /** Find participant by session and email */
    Optional<WorkflowParticipant> findByWorkflowSessionAndEmail(
            WorkflowSession session, String email);

    /** Find all participants with a specific status in a session */
    List<WorkflowParticipant> findByWorkflowSessionAndStatus(
            WorkflowSession session, ParticipantStatus status);

    /** Find all sessions where a user is a participant */
    List<WorkflowParticipant> findByUserOrderByLastUpdatedDesc(User user);

    /** Find all sessions where an email is a participant */
    List<WorkflowParticipant> findByEmailOrderByLastUpdatedDesc(String email);

    /** Check if a participant exists by share token */
    boolean existsByShareToken(String shareToken);

    /** Count participants in a session by status */
    long countByWorkflowSessionAndStatus(WorkflowSession session, ParticipantStatus status);

    /** Find expired participants that haven't completed */
    @Query(
            "SELECT p FROM WorkflowParticipant p WHERE p.expiresAt < CURRENT_TIMESTAMP AND p.status NOT IN ('SIGNED', 'DECLINED')")
    List<WorkflowParticipant> findExpiredIncompleteParticipants();

    /** Find all participants pending notification */
    @Query(
            "SELECT p FROM WorkflowParticipant p WHERE p.status = 'PENDING' AND p.workflowSession.status = 'IN_PROGRESS'")
    List<WorkflowParticipant> findPendingNotifications();

    /** Delete participant by ID and session owner (for authorization) */
    @Query(
            "DELETE FROM WorkflowParticipant p WHERE p.id = :participantId AND p.workflowSession.owner = :owner")
    void deleteByIdAndSessionOwner(
            @Param("participantId") Long participantId, @Param("owner") User owner);
}
