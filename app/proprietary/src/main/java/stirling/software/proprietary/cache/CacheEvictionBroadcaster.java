package stirling.software.proprietary.cache;

import java.util.Collection;
import java.util.List;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public interface CacheEvictionBroadcaster {

    void broadcast(Collection<CacheEviction> evictions);

    void broadcastToPeers(Collection<CacheEviction> evictions);

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
