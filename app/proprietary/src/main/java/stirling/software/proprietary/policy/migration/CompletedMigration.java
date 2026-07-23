package stirling.software.proprietary.policy.migration;

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
 * A one-time policy-subsystem migration that has finished, keyed by a stable migration id. Its
 * presence lets a migration skip its (otherwise every-boot) scan once it has run, instead of
 * re-scanning and finding nothing to do forever.
 */
@Entity
@Table(name = "policy_completed_migrations")
@NoArgsConstructor
@Getter
@Setter
public class CompletedMigration implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "applied_at")
    private Instant appliedAt;

    public CompletedMigration(String id, Instant appliedAt) {
        this.id = id;
        this.appliedAt = appliedAt;
    }
}
