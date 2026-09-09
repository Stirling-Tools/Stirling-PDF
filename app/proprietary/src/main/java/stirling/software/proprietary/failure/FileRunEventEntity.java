package stirling.software.proprietary.failure;

import java.io.Serializable;
import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One recorded failure incident. {@code actor} and {@code teamId} are plain values rather than
 * foreign keys, matching {@link stirling.software.proprietary.policy.source.SourceEntity}, and the
 * facets are snapshots at write time so re-classifying a kind never rewrites an old row.
 *
 * <p>Holds no document name or content: {@code fileId} is opaque, and {@code detail} is stripped of
 * names by {@link RecordFailure}.
 */
@Entity
@Table(
        name = "file_run_events",
        indexes = {
            // the review surface: this team's rows, newest first, optionally filtered by status
            @Index(name = "idx_file_run_events_team", columnList = "team_id, status, last_seen_at")
        },
        // One row per incident, enforced by the database rather than only by the store's read-then-
        // insert: two runs failing identically at the same moment would otherwise both find no row
        // and both insert, leaving a twin that reappears after the first is dismissed. Doubles as
        // the
        // rollup's lookup index. Note SQL treats NULLs as distinct, so this does not constrain the
        // unteamed rows a login-disabled deployment writes.
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_file_run_events_dedup",
                        columnNames = {"team_id", "dedup_key"}))
@NoArgsConstructor
@Getter
@Setter
public class FileRunEventEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "id")
    private String id;

    @Column(name = "team_id")
    private Long teamId;

    /** The user whose work produced the failure. Null when login is disabled. */
    @Column(name = "actor")
    private String actor;

    @Column(name = "kind_id", nullable = false)
    private String kindId;

    @Enumerated(EnumType.STRING)
    @Column(name = "stage", nullable = false)
    private FailureStage stage;

    @Enumerated(EnumType.STRING)
    @Column(name = "severity", nullable = false)
    private FailureSeverity severity;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false)
    private FailureScope scope;

    @Enumerated(EnumType.STRING)
    @Column(name = "origin", nullable = false)
    private FailureOrigin origin;

    @Column(name = "policy_id")
    private String policyId;

    @Column(name = "run_id")
    private String runId;

    /** Which folder, bucket or webhook fed the run. Null when a user supplied the file. */
    @Column(name = "source_id")
    private String sourceId;

    @Column(name = "file_id")
    private String fileId;

    @Column(name = "detail", columnDefinition = "text")
    private String detail;

    @Column(name = "dedup_key", length = 64, nullable = false)
    private String dedupKey;

    /** How many times this same failure has been seen. Starts at 1; the rollup increments it. */
    @Column(name = "occurrences", nullable = false)
    private int occurrences;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private FileRunEventStatus status;

    /** Who last changed {@link #status}. Null while the row is untouched. */
    @Column(name = "status_actor")
    private String statusActor;

    @Column(name = "status_at")
    private Instant statusAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;
}
