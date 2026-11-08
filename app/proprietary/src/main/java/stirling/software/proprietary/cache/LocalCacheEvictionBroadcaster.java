package stirling.software.proprietary.cache;

import java.util.Collection;

public class LocalCacheEvictionBroadcaster implements CacheEvictionBroadcaster {

    private final SecondLevelCacheEvictor evictor;

    public LocalCacheEvictionBroadcaster(SecondLevelCacheEvictor evictor) {
        this.evictor = evictor;
    }

    @Override
    public void broadcast(Collection<CacheEviction> evictions) {
        evictor.apply(evictions);
    }

    @Override
    public void broadcastToPeers(Collection<CacheEviction> evictions) {}
}
