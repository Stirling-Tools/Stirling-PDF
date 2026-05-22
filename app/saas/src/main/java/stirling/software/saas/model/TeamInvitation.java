package stirling.software.saas.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.*;

import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.ToString;

import stirling.software.common.model.enumeration.InvitationStatus;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;

/**
 * Team invitation entity tracking email-based team invitations with unique tokens. Invitations
 * expire after 7 days and can be in PENDING, ACCEPTED, REJECTED, or EXPIRED status.
 */
@Entity
@Table(name = "team_invitations")
@NoArgsConstructor
@Getter
@Setter
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
@ToString(onlyExplicitlyIncluded = true)
public class TeamInvitation implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "invitation_id")
    @EqualsAndHashCode.Include
    @ToString.Include
    private Long invitationId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "team_id", nullable = false)
    private Team team;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "inviter_user_id", nullable = false)
    private User inviter;

    @Column(name = "invitee_email", nullable = false)
    @ToString.Include
    private String inviteeEmail;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invitee_user_id")
    private User inviteeUser;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @ToString.Include
    private InvitationStatus status = InvitationStatus.PENDING;

    @Column(name = "invitation_token", unique = true, nullable = false)
    @EqualsAndHashCode.Include
    @ToString.Include
    private String invitationToken;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * Check if the invitation has expired
     *
     * @return true if current time is after expiration time
     */
    public boolean isExpired() {
        return expiresAt != null && LocalDateTime.now().isAfter(expiresAt);
    }

    /**
     * Check if the invitation is still pending and not expired
     *
     * @return true if status is PENDING and not expired
     */
    public boolean isPending() {
        return status == InvitationStatus.PENDING && !isExpired();
    }

    /**
     * Check if the invitation was accepted
     *
     * @return true if status is ACCEPTED
     */
    public boolean isAccepted() {
        return status == InvitationStatus.ACCEPTED;
    }

    /**
     * Check if the invitation was rejected
     *
     * @return true if status is REJECTED
     */
    public boolean isRejected() {
        return status == InvitationStatus.REJECTED;
    }
}
