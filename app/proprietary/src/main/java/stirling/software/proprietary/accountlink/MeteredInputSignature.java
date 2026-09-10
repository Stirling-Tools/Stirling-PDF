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
 * A dedup key the instance has metered this period, with the last time it saw it - the local
 * equivalent of the cloud's run grouping / lineage join (combined billing). The key (stored in
 * {@code signature}) is a policy run's correlation id, so all its sub-steps collapse to one charge;
 * or, for a standalone op, its input-set signature, deduped on a rolling <b>workflow window</b>
 * (see {@link AccountLinkProperties.Metering}): an identical input re-submitted within the window
 * is treated as chaining and not re-charged, while the same inputs after the window bill afresh.
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

    /** SHA-256 hex of the op's input set (64 chars); the dedup key within a period. */
    @Column(name = "signature", nullable = false, length = 64)
    private String signature;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    /**
     * When this input set was last metered — the anchor the workflow-window dedup compares against.
     */
    @Column(name = "last_metered_at")
    private LocalDateTime lastMeteredAt;

    public MeteredInputSignature(LocalDateTime periodStart, String signature, LocalDateTime at) {
        this.periodStart = periodStart;
        this.signature = signature;
        this.createdAt = at;
        this.lastMeteredAt = at;
    }

    /** Slides the window forward — the input set was seen again. */
    public void touch(LocalDateTime at) {
        this.lastMeteredAt = at;
    }
}
