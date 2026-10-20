package stirling.software.proprietary.cache;

import java.util.Collection;
import java.util.List;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Carries second-level cache evictions to every node that may hold the entries. Best effort:
 * delivery failures are logged, never thrown, because the database write they follow has already
 * committed; the region TTL bounds how long a lost eviction can leave an entry stale.
 */
public interface CacheEvictionBroadcaster {

    /** Evicts on this node and on every peer. For writes Hibernate on this node did not see. */
    void broadcast(Collection<CacheEviction> evictions);

    /** Evicts on every peer only. For writes Hibernate on this node already evicted itself. */
    void broadcastToPeers(Collection<CacheEviction> evictions);

    /**
     * {@link #broadcastToPeers} once the surrounding transaction commits, or now when there is
     * none. For bulk JPQL updates, which Hibernate evicts locally but raises no entity events for.
     */
    default void broadcastToPeersAfterCommit(CacheEviction... evictions) {
        List<CacheEviction> batch = List.of(evictions);
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            broadcastToPeers(batch);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        broadcastToPeers(batch);
                    }
                });
    }
}
