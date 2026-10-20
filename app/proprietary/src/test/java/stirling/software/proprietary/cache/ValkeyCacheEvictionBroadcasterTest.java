package stirling.software.proprietary.cache;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import tools.jackson.databind.json.JsonMapper;

/**
 * Two "nodes" on one Valkey: each has its own connection, listener container and evictor. The
 * {@code @EnabledIf} Docker probe must stay, or runners without Docker fail instead of skipping.
 */
@Testcontainers
@EnabledIf("isDockerAvailable")
class ValkeyCacheEvictionBroadcasterTest {

    @Container
    static final GenericContainer<?> VALKEY =
            new GenericContainer<>(DockerImageName.parse("valkey/valkey:8.0-alpine"))
                    .withExposedPorts(6379);

    static boolean isDockerAvailable() {
        return DockerClientFactory.instance().isDockerAvailable();
    }

    private static final CacheEviction EVICTION =
            CacheEviction.entity("stirling.software.proprietary.security.model.User", "42");

    private static final CacheEviction MARKER =
            CacheEviction.entity("stirling.software.proprietary.security.model.User", "7");

    private Node nodeA;
    private Node nodeB;

    private record Node(
            LettuceConnectionFactory factory,
            RedisMessageListenerContainer container,
            SecondLevelCacheEvictor evictor,
            ValkeyCacheEvictionBroadcaster broadcaster) {

        static Node start() throws Exception {
            LettuceConnectionFactory factory =
                    new LettuceConnectionFactory(
                            new RedisStandaloneConfiguration(
                                    VALKEY.getHost(), VALKEY.getMappedPort(6379)));
            factory.afterPropertiesSet();
            factory.start();
            SecondLevelCacheEvictor evictor = mock(SecondLevelCacheEvictor.class);
            ValkeyCacheEvictionBroadcaster broadcaster =
                    new ValkeyCacheEvictionBroadcaster(
                            new StringRedisTemplate(factory),
                            evictor,
                            JsonMapper.builder().build());
            RedisMessageListenerContainer container = new RedisMessageListenerContainer();
            container.setConnectionFactory(factory);
            container.addMessageListener(
                    broadcaster, new ChannelTopic(ValkeyCacheEvictionBroadcaster.CHANNEL));
            container.afterPropertiesSet();
            container.start();
            return new Node(factory, container, evictor, broadcaster);
        }

        void stop() throws Exception {
            container.stop();
            container.destroy();
            factory.destroy();
        }
    }

    @BeforeEach
    void startNodes() throws Exception {
        nodeA = Node.start();
        nodeB = Node.start();
        awaitSubscribers(2);
    }

    @AfterEach
    void stopNodes() throws Exception {
        nodeA.stop();
        nodeB.stop();
    }

    @Test
    void peersApplyWhatANodePublishesAndThePublisherSkipsItsOwnMessage() {
        nodeA.broadcaster().broadcastToPeers(List.of(EVICTION));

        verify(nodeB.evictor(), timeout(5000)).apply(List.of(EVICTION));

        // Same channel, published later: once A sees B's marker, its own message has passed it by.
        nodeB.broadcaster().broadcastToPeers(List.of(MARKER));
        verify(nodeA.evictor(), timeout(5000)).apply(List.of(MARKER));
        verify(nodeA.evictor(), never()).apply(List.of(EVICTION));
    }

    @Test
    void broadcastAppliesOnThePublisherAndOnPeers() {
        nodeA.broadcaster().broadcast(List.of(EVICTION));

        verify(nodeA.evictor()).apply(List.of(EVICTION));
        verify(nodeB.evictor(), timeout(5000)).apply(List.of(EVICTION));
    }

    @Test
    void resubscribingAfterAConnectionDropClearsTheWholeCache() {
        verify(nodeB.evictor(), never()).evictAll();

        killPubSubClients();

        verify(nodeA.evictor(), timeout(15000)).evictAll();
        verify(nodeB.evictor(), timeout(15000)).evictAll();
    }

    @Test
    void unreadableMessageClearsTheWholeCache() {
        new StringRedisTemplate(nodeA.factory())
                .convertAndSend(ValkeyCacheEvictionBroadcaster.CHANNEL, "not json");

        verify(nodeB.evictor(), timeout(5000)).evictAll();
    }

    private static void killPubSubClients() {
        try {
            VALKEY.execInContainer("valkey-cli", "CLIENT", "KILL", "TYPE", "pubsub");
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static void awaitSubscribers(int expected) throws Exception {
        long deadline = System.nanoTime() + 10_000_000_000L;
        while (System.nanoTime() < deadline) {
            String reply =
                    VALKEY.execInContainer(
                                    "valkey-cli",
                                    "PUBSUB",
                                    "NUMSUB",
                                    ValkeyCacheEvictionBroadcaster.CHANNEL)
                            .getStdout();
            String[] lines = reply.trim().split("\\s+");
            if (lines.length == 2 && Integer.parseInt(lines[1]) >= expected) {
                return;
            }
            Thread.onSpinWait();
        }
        throw new IllegalStateException("subscribers never reached " + expected);
    }
}
