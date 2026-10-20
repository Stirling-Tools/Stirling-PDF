package stirling.software.proprietary.cache;

import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.connection.SubscriptionListener;
import org.springframework.data.redis.core.StringRedisTemplate;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.ObjectMapper;

/**
 * Publishes evictions on a Valkey pub/sub channel and applies the ones peers publish.
 *
 * <p>Pub/sub does not replay what was sent while a subscriber was disconnected, so every
 * re-subscription after the first clears this node's whole second-level cache: after a Valkey
 * outage the node cannot know which evictions it missed.
 */
@Slf4j
public class ValkeyCacheEvictionBroadcaster
        implements CacheEvictionBroadcaster, MessageListener, SubscriptionListener {

    public static final String CHANNEL = "stirling:cache-evict";

    record Envelope(String origin, List<CacheEviction> evictions) {}

    private final StringRedisTemplate template;
    private final SecondLevelCacheEvictor evictor;
    private final ObjectMapper objectMapper;
    // Not cluster.node.id: two nodes configured with the same id would drop each other's messages.
    private final String origin = UUID.randomUUID().toString();
    private final AtomicBoolean subscribedBefore = new AtomicBoolean();

    public ValkeyCacheEvictionBroadcaster(
            StringRedisTemplate template,
            SecondLevelCacheEvictor evictor,
            ObjectMapper objectMapper) {
        this.template = template;
        this.evictor = evictor;
        this.objectMapper = objectMapper;
    }

    @Override
    public void broadcast(Collection<CacheEviction> evictions) {
        if (evictions.isEmpty()) {
            return;
        }
        evictor.apply(evictions);
        publish(evictions);
    }

    @Override
    public void broadcastToPeers(Collection<CacheEviction> evictions) {
        if (evictions.isEmpty()) {
            return;
        }
        publish(evictions);
    }

    private void publish(Collection<CacheEviction> evictions) {
        try {
            String payload =
                    objectMapper.writeValueAsString(new Envelope(origin, List.copyOf(evictions)));
            template.convertAndSend(CHANNEL, payload);
        } catch (RuntimeException ex) {
            log.warn(
                    "Could not publish {} second-level cache eviction(s) to peers; they stay"
                            + " stale until the region TTL: {}",
                    evictions.size(),
                    ex.toString());
        }
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        Envelope envelope;
        try {
            envelope =
                    objectMapper.readValue(
                            new String(message.getBody(), StandardCharsets.UTF_8), Envelope.class);
        } catch (RuntimeException ex) {
            log.warn(
                    "Unreadable cache eviction message; clearing the second-level cache: {}",
                    ex.toString());
            evictor.evictAll();
            return;
        }
        if (origin.equals(envelope.origin()) || envelope.evictions() == null) {
            return;
        }
        evictor.apply(envelope.evictions());
    }

    @Override
    public void onChannelSubscribed(byte[] channel, long count) {
        if (subscribedBefore.getAndSet(true)) {
            log.info(
                    "Re-subscribed to {}; clearing the second-level cache in case evictions were"
                            + " missed while disconnected",
                    CHANNEL);
            evictor.evictAll();
        }
    }
}
