package stirling.software.proprietary.policy.source;

import java.io.Serializable;

import org.springframework.data.domain.Persistable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One hour's document tally for a source: {@code bucketHour} is the hours-since-epoch the documents
 * were fed, {@code docCount} the running total for that hour. Rolling-window totals are summed from
 * these buckets. {@code sourceId} is a plain value, not a foreign key, matching the rest of the
 * subsystem so it stays decoupled from the security entities.
 */
@Entity
@Table(name = "policy_source_doc_counts")
@IdClass(SourceDocCountId.class)
@NoArgsConstructor
@Getter
@Setter
public class SourceDocCountEntity implements Serializable, Persistable<SourceDocCountId> {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "source_id")
    private String sourceId;

    @Id
    @Column(name = "bucket_hour")
    private long bucketHour;

    @Column(name = "doc_count")
    private long docCount;

    public SourceDocCountEntity(String sourceId, long bucketHour, long docCount) {
        this.sourceId = sourceId;
        this.bucketHour = bucketHour;
        this.docCount = docCount;
    }

    @Override
    @Transient
    public SourceDocCountId getId() {
        return new SourceDocCountId(sourceId, bucketHour);
    }

    @Override
    @Transient
    public boolean isNew() {
        return true;
    }
}
