package stirling.software.proprietary.aiformfill.model;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
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
 * Persistent entity used by the AI Form Fill feature (person, company, site, property,
 * certification, custom). Each row belongs to one user and holds a flexible field map that mirrors
 * the frontend's {@code Entity} type in {@code entityTypes.ts}.
 *
 * <p>Primary key is the client-generated UUID string rather than an auto-increment long so that
 * existing localStorage data and exported JSON blobs migrate with IDs intact and workflow
 * templates' role→entityId references remain stable.
 */
@Entity
@Table(
        name = "ai_form_fill_entities",
        indexes = {@Index(name = "idx_ai_form_fill_entities_owner", columnList = "owner_id")})
@NoArgsConstructor
@Getter
@Setter
public class FormFillEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id", length = 64, nullable = false, updatable = false)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(name = "entity_type", nullable = false, length = 32)
    private String entityType;

    @Column(name = "name", nullable = false)
    private String name;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "fields", columnDefinition = "jsonb")
    private Map<String, String> fields = new HashMap<>();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
