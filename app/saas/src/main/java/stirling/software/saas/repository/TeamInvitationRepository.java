package stirling.software.saas.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import stirling.software.common.model.enumeration.InvitationStatus;
import stirling.software.saas.model.TeamInvitation;

@ApplicationScoped
public class TeamInvitationRepository implements PanacheRepositoryBase<TeamInvitation, Long> {

    /** Find invitation by unique token */
    public Optional<TeamInvitation> findByInvitationToken(String token) {
        return find("invitationToken = ?1", token).firstResultOptional();
    }

    /** Find all invitations sent to an email address */
    public List<TeamInvitation> findByInviteeEmail(String email) {
        return find("inviteeEmail = ?1", email).list();
    }

    /** Find pending invitations for an email address (not expired) */
    public List<TeamInvitation> findPendingInvitationsByEmail(String email, LocalDateTime now) {
        return find("inviteeEmail = ?1 and status = 'PENDING' and expiresAt > ?2", email, now)
                .list();
    }

    /** Find all invitations for a team */
    public List<TeamInvitation> findByTeamId(Long teamId) {
        return find("team.id = ?1", teamId).list();
    }

    /** Find all invitations sent by a user */
    public List<TeamInvitation> findByInviterUserId(Long inviterUserId) {
        return find("inviter.id = ?1", inviterUserId).list();
    }

    /** Mark expired invitations as EXPIRED */
    @Transactional
    public int markExpiredInvitations(LocalDateTime now) {
        return (int) update("status = 'EXPIRED' WHERE status = 'PENDING' and expiresAt < ?1", now);
    }

    /** Check if there's already a pending invitation for this email to this team */
    public boolean existsPendingInvitationByTeamIdAndEmail(Long teamId, String email) {
        return count("team.id = ?1 and inviteeEmail = ?2 and status = 'PENDING'", teamId, email)
                > 0;
    }

    /** Find invitations by status */
    public List<TeamInvitation> findByStatus(InvitationStatus status) {
        return find("status = ?1", status).list();
    }

    /** Find invitations by status that expired before a given date */
    public List<TeamInvitation> findByStatusAndExpiresAtBefore(
            InvitationStatus status, LocalDateTime cutoffDate) {
        return find("status = ?1 and expiresAt < ?2", status, cutoffDate).list();
    }
}
