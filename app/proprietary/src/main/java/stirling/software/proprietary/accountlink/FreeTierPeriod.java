package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import org.springframework.data.domain.Persistable;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Singleton row anchoring an unlinked instance's own monthly period. Written only by {@link
 * FreeTierUsageService}.
 *
 * <p>{@link #anchorAt} never moves: deriving each start from the <em>previous</em> one would walk a
 * 31st anchor permanently down to the 28th.
 */
@Entity
@Table(name = "account_link_free_tier_period")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FreeTierPeriod implements Persistable<Long> {

    public static final long SINGLETON_ID = 1L;

    @Id private Long id;

    @Column(name = "anchor_at", nullable = false)
    private LocalDateTime anchorAt;

    /** Inclusive, always {@code anchorAt} plus a whole month count. */
    @Column(name = "period_start", nullable = false)
    private LocalDateTime periodStart;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Transient private boolean unsaved;

    public FreeTierPeriod(LocalDateTime anchorAt) {
        this.id = SINGLETON_ID;
        this.anchorAt = anchorAt;
        this.periodStart = anchorAt;
        this.updatedAt = anchorAt;
        this.unsaved = true;
    }

    /**
     * Forces an insert. The id is assigned, so Spring Data would otherwise read a new instance as
     * detached and merge it, overwriting a live anchor instead of losing the race for it.
     */
    @Override
    public boolean isNew() {
        return unsaved;
    }
}
