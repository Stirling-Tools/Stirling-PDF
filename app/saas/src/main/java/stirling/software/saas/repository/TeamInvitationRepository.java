package stirling.software.saas.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import stirling.software.common.model.enumeration.InvitationStatus;
import stirling.software.saas.model.TeamInvitation;

@Repository
public interface TeamInvitationRepository extends JpaRepository<TeamInvitation, Long> {

    /**
     * Find invitation by unique token
     *
     * @param token the invitation token
     * @return Optional of TeamInvitation if found
     */
    @Query(
            "SELECT ti FROM TeamInvitation ti JOIN FETCH ti.team JOIN FETCH ti.inviter WHERE ti.invitationToken = :token")
    Optional<TeamInvitation> findByInvitationToken(@Param("token") String token);

    /**
     * Find all invitations sent to an email address
     *
     * @param email the invitee email
     * @return List of invitations
     */
    @Query(
            "SELECT ti FROM TeamInvitation ti JOIN FETCH ti.team JOIN FETCH ti.inviter WHERE ti.inviteeEmail = :email")
    List<TeamInvitation> findByInviteeEmail(@Param("email") String email);

    /**
     * Find pending invitations for an email address (not expired)
     *
     * @param email the invitee email
     * @return List of pending invitations
     */
    @Query(
            "SELECT ti FROM TeamInvitation ti JOIN FETCH ti.team JOIN FETCH ti.inviter "
                    + "WHERE ti.inviteeEmail = :email AND ti.status = 'PENDING' AND ti.expiresAt > :now")
    List<TeamInvitation> findPendingInvitationsByEmail(
            @Param("email") String email, @Param("now") LocalDateTime now);

    /**
     * Find all invitations for a team
     *
     * @param teamId the team ID
     * @return List of invitations
     */
    @Query("SELECT ti FROM TeamInvitation ti JOIN FETCH ti.inviter WHERE ti.team.id = :teamId")
    List<TeamInvitation> findByTeamId(@Param("teamId") Long teamId);

    /**
     * Find all invitations sent by a user
     *
     * @param inviterUserId the inviter user ID
     * @return List of invitations
     */
    @Query(
            "SELECT ti FROM TeamInvitation ti JOIN FETCH ti.team WHERE ti.inviter.id = :inviterUserId")
    List<TeamInvitation> findByInviterUserId(@Param("inviterUserId") Long inviterUserId);

    /**
     * Mark expired invitations as EXPIRED
     *
     * @param now current timestamp
     * @return number of invitations marked as expired
     */
    @Modifying
    @Query(
            "UPDATE TeamInvitation ti SET ti.status = 'EXPIRED' WHERE ti.status = 'PENDING' AND ti.expiresAt < :now")
    int markExpiredInvitations(@Param("now") LocalDateTime now);

    /**
     * Check if there's already a pending invitation for this email to this team
     *
     * @param teamId the team ID
     * @param email the invitee email
     * @return true if pending invitation exists
     */
    @Query(
            "SELECT COUNT(ti) > 0 FROM TeamInvitation ti WHERE ti.team.id = :teamId "
                    + "AND ti.inviteeEmail = :email AND ti.status = 'PENDING'")
    boolean existsPendingInvitationByTeamIdAndEmail(
            @Param("teamId") Long teamId, @Param("email") String email);

    /**
     * Find invitations by status
     *
     * @param status the invitation status
     * @return List of invitations with given status
     */
    List<TeamInvitation> findByStatus(InvitationStatus status);

    /**
     * Find invitations by status that expired before a given date
     *
     * @param status the invitation status
     * @param cutoffDate the cutoff expiration date
     * @return List of invitations
     */
    List<TeamInvitation> findByStatusAndExpiresAtBefore(
            InvitationStatus status, LocalDateTime cutoffDate);
}
