package stirling.software.proprietary.storage.model;

import java.io.Serializable;
import java.time.LocalDateTime;

import org.hibernate.annotations.CreationTimestamp;

import jakarta.persistence.Column;
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
import jakarta.persistence.UniqueConstraint;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;

@Entity
@Table(
        name = "file_shares",
        uniqueConstraints = {
            @UniqueConstraint(
                    name = "uk_file_share_user",
                    columnNames = {"stored_file_id", "shared_with_user_id"}),
            @UniqueConstraint(
                    name = "uk_file_share_token",
                    columnNames = {"share_token"})
        },
        indexes = {
            @Index(name = "idx_file_shares_file_id", columnList = "stored_file_id"),
            @Index(name = "idx_file_shares_share_token", columnList = "share_token"),
            @Index(name = "idx_file_shares_participant", columnList = "workflow_participant_id")
        })
@NoArgsConstructor
@Getter
@Setter
public class FileShare implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "file_share_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "stored_file_id", nullable = false)
    private StoredFile file;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "shared_with_user_id")
    private User sharedWithUser;

    @Column(name = "share_token", unique = true)
    private String shareToken;

    @Enumerated(EnumType.STRING)
    @Column(name = "access_role")
    private ShareAccessRole accessRole;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    // Link to workflow participant if this share is for a workflow
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workflow_participant_id")
    private WorkflowParticipant workflowParticipant;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    // Helper methods

    public boolean isWorkflowShare() {
        return workflowParticipant != null;
    }
}
