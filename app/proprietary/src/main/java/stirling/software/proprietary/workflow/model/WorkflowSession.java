package stirling.software.proprietary.workflow.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
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
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.converter.JsonMapConverter;
import stirling.software.proprietary.storage.model.StoredFile;

/**
 * Represents a workflow session for multi-participant document processing. Replaces
 * SigningSessionEntity with a more generic workflow abstraction that supports signing, review,
 * approval, and other collaborative workflows.
 *
 * <p>This entity coordinates the workflow lifecycle and links to StoredFile for actual document
 * storage (no more direct BLOBs).
 */
@Entity
@Table(
        name = "workflow_sessions",
        indexes = {
            @Index(name = "idx_workflow_sessions_owner", columnList = "owner_id"),
            @Index(name = "idx_workflow_sessions_session_id", columnList = "session_id")
        })
@NoArgsConstructor
@Getter
@Setter
public class WorkflowSession implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", unique = true, nullable = false, length = 36)
    private String sessionId = UUID.randomUUID().toString();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "workflow_type", nullable = false, length = 20)
    @Enumerated(EnumType.STRING)
    private WorkflowType workflowType;

    @Column(name = "document_name", nullable = false)
    private String documentName;

    // Replaces BLOB storage with StoredFile reference
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "original_file_id", nullable = false)
    private StoredFile originalFile;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "processed_file_id")
    private StoredFile processedFile;

    @Column(name = "owner_email")
    private String ownerEmail;

    @Column(name = "message", columnDefinition = "text")
    private String message;

    @Column(name = "due_date", length = 50)
    private String dueDate;

    @Column(name = "status", nullable = false, length = 20)
    @Enumerated(EnumType.STRING)
    private WorkflowStatus status = WorkflowStatus.IN_PROGRESS;

    @Column(name = "finalized", nullable = false)
    private boolean finalized = false;

    @OneToMany(
            mappedBy = "workflowSession",
            cascade = CascadeType.ALL,
            orphanRemoval = true,
            fetch = FetchType.LAZY)
    private List<WorkflowParticipant> participants = new ArrayList<>();

    // Workflow-specific settings stored as JSON for flexibility
    // For signing: signature appearance settings, wet signature metadata
    // For review: review guidelines, comment templates
    // For approval: approval criteria, decision options
    @Convert(converter = JsonMapConverter.class)
    @Column(name = "workflow_metadata", columnDefinition = "jsonb")
    private Map<String, Object> workflowMetadata = new HashMap<>();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // Helper methods

    public void addParticipant(WorkflowParticipant participant) {
        participants.add(participant);
        participant.setWorkflowSession(this);
    }

    public void removeParticipant(WorkflowParticipant participant) {
        participants.remove(participant);
        participant.setWorkflowSession(null);
    }

    public boolean isActive() {
        return status == WorkflowStatus.IN_PROGRESS && !finalized;
    }

    public boolean hasProcessedFile() {
        return processedFile != null;
    }
}
