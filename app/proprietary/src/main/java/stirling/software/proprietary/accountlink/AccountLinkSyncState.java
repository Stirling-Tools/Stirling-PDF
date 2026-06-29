package stirling.software.proprietary.accountlink;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Singleton row holding this instance's daily-sync bookkeeping (combined-billing "Mode A").
 *
 * <p>{@link #lastSyncSeq} is reserved (incremented + persisted) <em>before</em> each report so it
 * is strictly monotonic across restarts and partial failures — SaaS dedups replays by comparing it,
 * so a never-decreasing seq is the contract. {@link #lastSuccessAt} is the wall-clock of the last
 * sync SaaS accepted and drives the fail-open→closed grace window.
 *
 * <p>Auto-created by Hibernate ({@code ddl-auto=update}); written only by the flag-gated sync.
 */
@Entity
@Table(name = "account_link_sync_state")
@Getter
@Setter
@NoArgsConstructor
public class AccountLinkSyncState {

    /** One instance links to one team → one bookkeeping row. */
    public static final long SINGLETON_ID = 1L;

    @Id private Long id;

    @Column(name = "last_sync_seq", nullable = false)
    private long lastSyncSeq;

    /** Null until the first sync SaaS accepts. */
    @Column(name = "last_success_at")
    private LocalDateTime lastSuccessAt;
}
