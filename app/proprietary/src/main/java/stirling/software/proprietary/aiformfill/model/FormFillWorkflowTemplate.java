package stirling.software.proprietary.aiformfill.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import stirling.software.proprietary.security.model.User;

/**
 * Saved workflow template for AI Form Fill — remembers a form signature plus the role→entity
 * mapping (and any per-file overrides) so that returning users skip the role-assignment UI.
 *
 * <p>Primary key is the client-generated UUID string (see {@link FormFillEntity} for rationale).
 * The {@code roleEntityMap} values are {@link FormFillEntity#getId()} UUIDs, not DB references, so
 * no FK cascade is enforced; stale role→entity pointers are tolerated and surfaced to the UI.
 */
@Entity
@Table(
        name = "ai_form_fill_workflow_templates",
        indexes = {
            @Index(
                    name = "idx_ai_form_fill_wf_owner_signature",
                    columnList = "owner_id, form_signature")
        })
@NoArgsConstructor
@Getter
@Setter
public class FormFillWorkflowTemplate implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", length = 64, nullable = false, updatable = false)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "form_signature", nullable = false, length = 128)
    private String formSignature;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "role_entity_map", columnDefinition = "jsonb")
    private Map<String, String> roleEntityMap = new HashMap<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "file_overrides", columnDefinition = "jsonb")
    private Map<String, Map<String, String>> fileOverrides = new HashMap<>();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "last_used_at")
    private LocalDateTime lastUsedAt;
}
