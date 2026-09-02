package stirling.software.proprietary.policy.source;

import java.io.Serializable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A source's lifetime document total, denormalized so the overview reads the all-time count in one
 * row instead of scanning the source's whole hourly-bucket history, and so {@link
 * SourceDocCountEntity} buckets can be pruned to the rolling 30-day window without losing it.
 *
 * <p>Like {@link SourceDocCountEntity}, a new source's first total row is inserted rather than
 * merged, so a concurrent insert surfaces as a constraint violation the counter retries as an
 * increment instead of silently overwriting it.
 */
@Entity
@Table(name = "policy_source_doc_totals")
@NoArgsConstructor
@Getter
@Setter
public class SourceDocTotalEntity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "source_id")
    private String sourceId;

    @Column(name = "doc_total")
    private long docTotal;

    public SourceDocTotalEntity(String sourceId, long docTotal) {
        this.sourceId = sourceId;
        this.docTotal = docTotal;
    }
}
