package stirling.software.proprietary.policy.source;

import java.io.Serializable;

import org.springframework.data.domain.Persistable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * A source's lifetime document total, denormalized so the overview reads the all-time count in one
 * row instead of scanning the source's whole hourly-bucket history, and so {@link
 * SourceDocCountEntity} buckets can be pruned to the rolling 30-day window without losing it.
 *
 * <p>Like {@link SourceDocCountEntity}, implements {@link Persistable} reporting {@code isNew() ==
 * true} so a new source's first {@code save} {@code persist}s (a raw INSERT) and a concurrent
 * insert surfaces as a constraint violation the counter retries as an increment, rather than {@code
 * merge} silently overwriting it.
 */
@Entity
@Table(name = "policy_source_doc_totals")
@NoArgsConstructor
@Getter
@Setter
public class SourceDocTotalEntity implements Serializable, Persistable<String> {

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

    @Override
    @Transient
    public String getId() {
        return sourceId;
    }

    @Override
    @Transient
    public boolean isNew() {
        return true;
    }
}
