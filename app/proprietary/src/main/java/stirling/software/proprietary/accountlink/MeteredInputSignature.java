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
 * One {@code (billing period, input-set signature)} the instance has already metered — the local
 * equivalent of the cloud's lineage join (combined-billing "Mode A"). Before accruing a billable
 * op, the meter claims its op signature here; a re-submission of the identical input set finds the
 * signature present and is <b>not</b> re-charged, matching the in-cloud dedup so the same operation
 * costs the same whether it runs on the instance or in the cloud.
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

    public MeteredInputSignature(
            LocalDateTime periodStart, String signature, LocalDateTime createdAt) {
        this.periodStart = periodStart;
        this.signature = signature;
        this.createdAt = createdAt;
    }
}
