package stirling.software.proprietary.workflow.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.ShareAccessRole;

/**
 * Represents a participant in a workflow session. Replaces SigningParticipantEntity with broader
 * workflow support.
 *
 * <p>Integrates with FileShare for access control - each participant gets a FileShare entry linked
 * to this participant record for unified access control.
 */
@Entity
@Table(
        name = "workflow_participants",
        indexes = {
            @Index(name = "idx_workflow_participants_session", columnList = "workflow_session_id"),
            @Index(name = "idx_workflow_participants_token", columnList = "share_token"),
            @Index(name = "idx_workflow_participants_user", columnList = "user_id")
        })
@NoArgsConstructor
@Getter
@Setter
public class WorkflowParticipant implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workflow_session_id", nullable = false)
    private WorkflowSession workflowSession;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "email")
    private String email;

    @Column(name = "name")
    private String name;

    // Workflow progress tracking
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ParticipantStatus status = ParticipantStatus.PENDING;

    // Access control (unified with FileShare)
    @Column(name = "share_token", unique = true, length = 36)
    private String shareToken;

    @Enumerated(EnumType.STRING)
    @Column(name = "access_role", nullable = false, length = 20)
    private ShareAccessRole accessRole;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    // Workflow-specific data stored as JSON for flexibility
    // For signing: wet signature coordinates, signature appearance settings
    // For review: assigned review sections, comment preferences
    // For approval: decision criteria, approval authority level
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "participant_metadata", columnDefinition = "jsonb")
    private Map<String, Object> participantMetadata = new HashMap<>();

    // Notification history
    @ElementCollection(fetch = FetchType.LAZY)
    @CollectionTable(
            name = "participant_notifications",
            joinColumns = @JoinColumn(name = "participant_id"))
    @Column(name = "notification_message", columnDefinition = "text")
    private List<String> notifications = new ArrayList<>();

    @UpdateTimestamp
    @Column(name = "last_updated")
    private LocalDateTime lastUpdated;

    // Helper methods

    public void addNotification(String message) {
        notifications.add(message);
    }

    public boolean isExpired() {
        return expiresAt != null && LocalDateTime.now().isAfter(expiresAt);
    }

    public boolean hasCompleted() {
        return status == ParticipantStatus.SIGNED || status == ParticipantStatus.DECLINED;
    }

    /**
     * Determines the effective access role based on participant status. After completion
     * (signed/declined), downgrade to VIEWER.
     */
    public ShareAccessRole getEffectiveRole() {
        if (hasCompleted()) {
            return ShareAccessRole.VIEWER;
        }
        return accessRole;
    }

    public boolean canEdit() {
        return !hasCompleted()
                && !isExpired()
                && (accessRole == ShareAccessRole.EDITOR
                        || accessRole == ShareAccessRole.COMMENTER);
    }
}
