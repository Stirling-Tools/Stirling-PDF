package stirling.software.proprietary.classification.store;

import java.io.Serializable;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * JPA row for a team's classification taxonomy — one row per team. The taxonomy lives as JSON in
 * {@code taxonomyJson} (authoritative on read). {@code teamId} is the natural key; the sentinel
 * {@link #NO_TEAM} stands in for the unteamed (login-disabled / self-hosted single-team) case,
 * since a primary key can't be null (policies store a nullable {@code team_id}, but this table is
 * keyed one-per-team). Kept decoupled from the security entities — {@code teamId} is a plain value,
 * not a foreign key — so classification can be enabled or disabled without touching them.
 */
@Entity
@Table(name = "classification_taxonomies")
@NoArgsConstructor
@Getter
@Setter
public class TaxonomyEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    /** Sentinel key for the unteamed taxonomy (login disabled / no resolvable team). */
    public static final long NO_TEAM = 0L;

    @Id
    @Column(name = "team_id")
    private long teamId;

    @Column(name = "taxonomy_json", columnDefinition = "text")
    private String taxonomyJson;

    @Column(name = "updated_at")
    private Instant updatedAt;

    @Column(name = "updated_by")
    private String updatedBy;
}
