package stirling.software.proprietary.storage.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import jakarta.persistence.CascadeType;
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
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.workflow.model.WorkflowSession;

@Entity
@Table(
        name = "stored_files",
        indexes = {
            @Index(name = "idx_stored_files_owner", columnList = "owner_id"),
            @Index(name = "idx_stored_files_workflow", columnList = "workflow_session_id")
        })
@NoArgsConstructor
@Getter
@Setter
public class StoredFile implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "stored_file_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "original_filename", nullable = false)
    private String originalFilename;

    @Column(name = "content_type")
    private String contentType;

    @Column(name = "size_bytes")
    private long sizeBytes;

    @Column(name = "storage_key", nullable = false, unique = true)
    private String storageKey;

    @Column(name = "history_filename")
    private String historyFilename;

    @Column(name = "history_content_type")
    private String historyContentType;

    @Column(name = "history_size_bytes")
    private Long historySizeBytes;

    @Column(name = "history_storage_key", unique = true)
    private String historyStorageKey;

    @Column(name = "audit_log_filename")
    private String auditLogFilename;

    @Column(name = "audit_log_content_type")
    private String auditLogContentType;

    @Column(name = "audit_log_size_bytes")
    private Long auditLogSizeBytes;

    @Column(name = "audit_log_storage_key", unique = true)
    private String auditLogStorageKey;

    // Link to workflow if this file is part of a workflow
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workflow_session_id")
    private WorkflowSession workflowSession;

    // Purpose classification
    @Column(name = "file_purpose")
    @Enumerated(EnumType.STRING)
    private FilePurpose purpose;

    @OneToMany(
            mappedBy = "file",
            fetch = FetchType.LAZY,
            cascade = CascadeType.ALL,
            orphanRemoval = true)
    private Set<FileShare> shares = new HashSet<>();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
