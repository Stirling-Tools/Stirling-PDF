package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A run/document billing key with the successful step count for its current charge. Another charge
 * begins when the configured step limit or rolling workflow window is reached.
 *
 * <p>{@code lastMeteredAt} is refreshed on every sighting (the window slides, as recording a cloud
 * artifact touches its job). One row per {@code (period, signature)}; the unique constraint also
 * makes the first-sighting insert an atomic claim under concurrency.
 *
 * <p>Auto-created by Hibernate ({@code ddl-auto=update}); written only by the flag-gated meter.
 */
@Entity
@Table(
        name = "account_link_metered_signature",
        uniqueConstraints =
                @UniqueConstraint(
                        name = "uk_account_link_metered_signature",
                        columnNames = {"period_start", "signature"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MeteredInputSignature {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "period_start", nullable = false)
    private LocalDateTime periodStart;

    /** Run-scoped document id, or the run id when the dispatch has no single source document. */
    @Column(name = "signature", nullable = false, length = 64)
    private String signature;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /** Last successful step; anchors the rolling workflow window. */
    @Column(name = "last_metered_at")
    private LocalDateTime lastMeteredAt;

    /** Null on rows predating step counting; treated as one already-charged step. */
    @Column(name = "step_count")
    private Integer stepCount;

    public MeteredInputSignature(LocalDateTime periodStart, String signature, LocalDateTime at) {
        this.periodStart = periodStart;
        this.signature = signature;
        this.createdAt = at;
        this.lastMeteredAt = at;
        this.stepCount = 1;
    }
}
